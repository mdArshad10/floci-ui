import {useEffect, useRef} from 'react'
import {type FlociRequestEvent, subscribeRequests} from '@/api/floci-client'
import {createLogGroup, createLogStream, putLogEvents} from '@/api/services'

const FLUSH_INTERVAL_MS = 5_000
// Services whose calls we must NEVER forward to CloudWatch (would cause infinite loop)
const SKIP_SERVICES = new Set(['cloudwatch', 'health'])

/**
 * Background hook that captures every Floci HTTP call and batches them into
 * CloudWatch Logs — one log group per service (/floci/<service>), one stream
 * per calendar day.
 *
 * Mount once at the root layout; the hook cleans up on unmount.
 */
export function useCloudWatchIngestor() {
    // Map<groupName, events[]>
    const bufferRef = useRef<Map<string, FlociRequestEvent[]>>(new Map())
    // Track groups/streams we've already ensured exist so we don't re-create them
    const knownGroupsRef = useRef<Set<string>>(new Set())
    const knownStreamsRef = useRef<Set<string>>(new Set())
    const flushingRef = useRef(false)

    useEffect(() => {
        // Subscribe to all Floci HTTP events
        const unsub = subscribeRequests((event) => {
            if (SKIP_SERVICES.has(event.service)) return
            const groupName = `/floci/${event.service}`
            const buf = bufferRef.current
            const existing = buf.get(groupName)
            if (existing) {
                existing.push(event)
            } else {
                buf.set(groupName, [event])
            }
        })

        const timer = setInterval(() => {
            void flush(bufferRef.current, knownGroupsRef.current, knownStreamsRef.current, flushingRef)
        }, FLUSH_INTERVAL_MS)

        return () => {
            unsub()
            clearInterval(timer)
        }
    }, [])
}

async function flush(
    buffer: Map<string, FlociRequestEvent[]>,
    knownGroups: Set<string>,
    knownStreams: Set<string>,
    flushingRef: React.MutableRefObject<boolean>,
) {
    if (flushingRef.current || buffer.size === 0) return
    flushingRef.current = true

    // Snapshot and clear immediately so new events keep accumulating
    const snapshot = new Map(buffer)
    buffer.clear()

    try {
        for (const [groupName, events] of snapshot) {
            // Ensure log group
            if (!knownGroups.has(groupName)) {
                try {
                    await createLogGroup(groupName)
                } catch {
                    // ResourceAlreadyExistsException → fine
                }
                knownGroups.add(groupName)
            }

            // One stream per calendar day
            const streamName = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
            const streamKey = `${groupName}::${streamName}`

            if (!knownStreams.has(streamKey)) {
                try {
                    await createLogStream(groupName, streamName)
                } catch {
                    // ResourceAlreadyExistsException → fine
                }
                knownStreams.add(streamKey)
            }

            const logEvents = events.map((ev) => ({
                timestamp: ev.timestamp,
                message: JSON.stringify({
                    method: ev.method,
                    path: ev.path,
                    statusCode: ev.statusCode,
                    latencyMs: ev.latencyMs,
                }),
            }))

            try {
                await putLogEvents(groupName, streamName, logEvents)
            } catch (err) {
                console.warn('[CloudWatch Ingestor] putLogEvents failed for', groupName, err)
            }
        }
    } finally {
        flushingRef.current = false
    }
}
