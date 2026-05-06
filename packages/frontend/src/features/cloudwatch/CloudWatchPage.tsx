import {useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Activity, AreaChart, Bell, Info, RefreshCw, Search} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {getLogEvents, listAlarms, listLogGroups, listLogStreams, listMetrics} from '@/api/services'
import {timeAgo} from '@/lib/utils'
import type {CWLogEvent} from '@/api/types'

// ─── Ingestor event parser ─────────────────────────────────────────────────────

interface IngestorEvent {
    method: string
    path: string
    action?: string
    statusCode: number
    latencyMs: number
}

function tryParseIngestor(message: string): IngestorEvent | null {
    if (!message.trimStart().startsWith('{')) return null
    try {
        const obj = JSON.parse(message) as Record<string, unknown>
        if (typeof obj.method === 'string' && typeof obj.statusCode === 'number') {
            return {
                method: obj.method as string,
                path: (obj.path as string | undefined) ?? '',
                action: obj.action as string | undefined,
                statusCode: obj.statusCode as number,
                latencyMs: (obj.latencyMs as number | undefined) ?? 0,
            }
        }
    } catch { /* not JSON */
    }
    return null
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const METHOD_STYLES: Record<string, { bg: string; color: string }> = {
    GET: {bg: 'rgba(34,197,94,0.15)', color: '#4ade80'},
    POST: {bg: 'rgba(59,130,246,0.15)', color: '#60a5fa'},
    PUT: {bg: 'rgba(249,115,22,0.15)', color: '#fb923c'},
    DELETE: {bg: 'rgba(239,68,68,0.15)', color: '#f87171'},
    PATCH: {bg: 'rgba(168,85,247,0.15)', color: '#c084fc'},
}

function methodStyle(method: string) {
    return METHOD_STYLES[method.toUpperCase()] ?? {bg: 'rgba(107,114,128,0.15)', color: '#9ca3af'}
}

function statusColor(code: number): string {
    if (code >= 500) return '#f87171'
    if (code >= 400) return '#fb923c'
    if (code >= 300) return '#60a5fa'
    return '#4ade80'
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ─── Log event row ─────────────────────────────────────────────────────────────

function LogEventRow({event}: { event: CWLogEvent }) {
    const parsed = tryParseIngestor(event.message)
    const ts = new Date(event.timestamp).toISOString()

    if (parsed) {
        const ms = methodStyle(parsed.method)
        return (
            <div className="log-line" style={{display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap'}}>
                <span style={{color: '#5f7080', fontSize: 11, flexShrink: 0}}>{ts}</span>

                <span
                    className="badge"
                    style={{
                        background: ms.bg,
                        color: ms.color,
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 10
                    }}
                >
          {parsed.method}
        </span>

                <span className="mono" style={{
                    fontSize: 12,
                    color: '#d1d1d1',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
          {parsed.path}
        </span>

                {parsed.action && (
                    <span style={{fontSize: 11, color: '#8d9cad', flexShrink: 0}}>{parsed.action}</span>
                )}

                <span
                    className="badge"
                    style={{
                        background: `${statusColor(parsed.statusCode)}22`,
                        color: statusColor(parsed.statusCode),
                        fontSize: 10,
                        flexShrink: 0
                    }}
                >
          {parsed.statusCode}
        </span>

                <span style={{fontSize: 11, color: '#5f7080', flexShrink: 0}}>{parsed.latencyMs}ms</span>
            </div>
        )
    }

    return (
        <div className="log-line">
            <span style={{color: '#5f7080', fontSize: 11}}>{ts}</span>
            {'  '}
            <span style={{color: '#d1d1d1'}}>{event.message}</span>
        </div>
    )
}

// ─── Live indicator ────────────────────────────────────────────────────────────

function LiveDot() {
    return (
        <span title="Auto-refreshing every 10s"
              style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4ade80'}}>
      <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#22c55e', boxShadow: '0 0 5px #22c55e',
          display: 'inline-block',
      }}/>
      Live
    </span>
    )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function CloudWatchPage() {
    const [prefix, setPrefix] = useState('')
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
    const [selectedStream, setSelectedStream] = useState<string | null>(null)
    const [eventSearch, setEventSearch] = useState('')

    // Auto-refresh every 10 s so ingestor events appear without manual refresh
    const groupsQuery = useQuery({
        queryKey: ['cloudwatch', 'groups', prefix],
        queryFn: ({signal}) => listLogGroups(prefix || undefined, signal),
        refetchInterval: 10_000,
    })
    const alarmsQuery = useQuery({
        queryKey: ['cloudwatch', 'alarms'],
        queryFn: ({signal}) => listAlarms(signal),
        refetchInterval: 30_000,
    })
    const metricsQuery = useQuery({
        queryKey: ['cloudwatch', 'metrics'],
        queryFn: ({signal}) => listMetrics(signal),
        refetchInterval: 30_000,
    })
    const streamsQuery = useQuery({
        queryKey: ['cloudwatch', 'streams', selectedGroup],
        queryFn: ({signal}) => listLogStreams(selectedGroup!, signal),
        enabled: Boolean(selectedGroup),
        refetchInterval: 10_000,
    })
    const eventsQuery = useQuery({
        queryKey: ['cloudwatch', 'events', selectedGroup, selectedStream],
        queryFn: ({signal}) => getLogEvents(selectedGroup!, selectedStream!, signal),
        enabled: Boolean(selectedGroup && selectedStream),
        refetchInterval: 10_000,
    })

    const filteredEvents = useMemo(() => {
        const events = eventsQuery.data ?? []
        if (!eventSearch) return events
        const q = eventSearch.toLowerCase()
        return events.filter((e) => e.message.toLowerCase().includes(q))
    }, [eventsQuery.data, eventSearch])

    function handleRefresh() {
        void groupsQuery.refetch()
        void alarmsQuery.refetch()
        void metricsQuery.refetch()
        if (selectedGroup) void streamsQuery.refetch()
        if (selectedGroup && selectedStream) void eventsQuery.refetch()
    }

    const selectedGroupName = selectedGroup ?? 'Select a log group'
    const isFlociGroup = selectedGroup?.startsWith('/floci/')

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <h2>CloudWatch</h2>
                    <span className="info-link">
            <Info size={11}/>
            Logs · Metrics · Alarms
          </span>
                </div>
                <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <LiveDot/>
                    <button className="button" onClick={handleRefresh}>
                        <RefreshCw size={13}/>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Search bar + ingestor hint */}
            <div className="input-row" style={{flexDirection: 'column', alignItems: 'stretch', gap: 8}}>
                <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <Search size={14} color="#8d9cad"/>
                    <input
                        className="input"
                        style={{flex: 1}}
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                        placeholder="Filter log groups by prefix…  (try /floci/)"
                    />
                    <span style={{fontSize: 11, color: '#5f7080', whiteSpace: 'nowrap'}}>
            {groupsQuery.data?.length ?? 0} group{groupsQuery.data?.length !== 1 ? 's' : ''}
          </span>
                </div>
            </div>

            <div className="split">
                {/* ── Left: log group list ── */}
                <aside className="list-pane">
                    <div className="widget-header">
                        <Activity size={13} color="#8d9cad"/>
                        <h3>Log groups</h3>
                    </div>

                    {groupsQuery.isLoading ? (
                        <div className="empty"><p>Loading log groups…</p></div>
                    ) : groupsQuery.isError ? (
                        <EmptyState icon={AreaChart} title="Cannot load log groups"
                                    description="CloudWatch Logs did not respond from the Floci endpoint."/>
                    ) : (groupsQuery.data ?? []).length === 0 ? (
                        <EmptyState
                            icon={Activity}
                            title="No log groups yet"
                            description="Navigate to S3, SQS, Lambda or any other service — the CloudWatch ingestor will create /floci/* log groups automatically within 5 seconds."
                        />
                    ) : (
                        groupsQuery.data?.map((group) => {
                            const isFloci = group.name.startsWith('/floci/')
                            const service = isFloci ? group.name.replace('/floci/', '') : null
                            return (
                                <button
                                    key={group.name}
                                    className={`list-item ${selectedGroup === group.name ? 'active' : ''}`}
                                    onClick={() => {
                                        setSelectedGroup(group.name);
                                        setSelectedStream(null);
                                        setEventSearch('')
                                    }}
                                >
                                    <strong style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                        {isFloci && (
                                            <span style={{
                                                fontSize: 10,
                                                padding: '1px 5px',
                                                borderRadius: 3,
                                                background: 'rgba(255,153,0,0.15)',
                                                color: '#ff9900',
                                                fontWeight: 600
                                            }}>
                        {service}
                      </span>
                                        )}
                                        {group.name}
                                    </strong>
                                    <span>
                    {formatBytes(group.storedBytes)} stored · {timeAgo(group.createdAt)}
                  </span>
                                </button>
                            )
                        })
                    )}
                </aside>

                {/* ── Right: detail ── */}
                <section className="detail-pane">
                    {!selectedGroup ? (
                        <div className="content">
                            {/* Overview: metrics + alarms */}
                            <div className="grid two">
                                <section className="table-panel">
                                    <div className="widget-header"><h3>Metrics</h3></div>
                                    {metricsQuery.isLoading ? (
                                        <div className="empty"><p>Loading metrics…</p></div>
                                    ) : (metricsQuery.data ?? []).length === 0 ? (
                                        <EmptyState icon={AreaChart} title="No metrics"
                                                    description="No CloudWatch metrics were returned by Floci."/>
                                    ) : (
                                        <table className="table">
                                            <thead>
                                            <tr>
                                                <th>Namespace</th>
                                                <th>Metric</th>
                                                <th>Dimensions</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {metricsQuery.data?.map((metric) => (
                                                <tr key={metric.id}>
                                                    <td>{metric.namespace}</td>
                                                    <td>{metric.metricName}</td>
                                                    <td className="mono">{metric.dimensions.map((d) => `${d.name}=${d.value}`).join(', ') || '—'}</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>

                                <section className="table-panel">
                                    <div className="widget-header"><h3>Alarms</h3></div>
                                    {(alarmsQuery.data ?? []).length === 0 ? (
                                        <EmptyState icon={Bell} title="No alarms"
                                                    description="No CloudWatch alarms were returned by Floci."/>
                                    ) : (
                                        <table className="table">
                                            <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>State</th>
                                                <th>Metric</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {alarmsQuery.data?.map((alarm) => (
                                                <tr key={alarm.alarmName}>
                                                    <td>{alarm.alarmName}</td>
                                                    <td style={{color: alarm.stateValue === 'OK' ? '#4ade80' : alarm.stateValue === 'ALARM' ? '#f87171' : '#f59e0b'}}>
                                                        {alarm.stateValue}
                                                    </td>
                                                    <td>{alarm.metricName ?? '—'}</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>
                            </div>

                            <div className="section-space">
                                <EmptyState
                                    icon={Activity}
                                    title="Select a log group"
                                    description="Streams and events will appear here. /floci/* groups are created automatically by the CloudWatch ingestor as you use other services."
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Group header */}
                            <div className="page-header">
                                <div className="page-title">
                                    <h2 style={{fontSize: 15}}>{selectedGroupName}</h2>
                                    {isFlociGroup && (
                                        <span style={{
                                            fontSize: 11,
                                            padding: '2px 7px',
                                            borderRadius: 3,
                                            background: 'rgba(255,153,0,0.14)',
                                            color: '#ff9900'
                                        }}>
                      ingestor
                    </span>
                                    )}
                                </div>
                                <button className="button" onClick={() => void streamsQuery.refetch()}>
                                    <RefreshCw size={13}/>
                                </button>
                            </div>

                            <div className="content"
                                 style={{paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 14}}>

                                {/* Streams list */}
                                <section className="table-panel">
                                    <div className="widget-header">
                                        <h3>Streams</h3>
                                        {streamsQuery.data && (
                                            <span style={{marginLeft: 'auto', fontSize: 11, color: '#5f7080'}}>
                        {streamsQuery.data.length} stream{streamsQuery.data.length !== 1 ? 's' : ''}
                      </span>
                                        )}
                                    </div>
                                    {streamsQuery.isLoading ? (
                                        <div className="empty compact"><p>Loading streams…</p></div>
                                    ) : (streamsQuery.data ?? []).length === 0 ? (
                                        <EmptyState icon={AreaChart} title="No streams"
                                                    description="No log streams were found for this log group."
                                                    compact/>
                                    ) : (
                                        <table className="table">
                                            <thead>
                                            <tr>
                                                <th>Stream name</th>
                                                <th style={{width: 130}}>Last event</th>
                                                <th style={{width: 90}}>Stored</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {streamsQuery.data?.map((stream) => (
                                                <tr
                                                    key={stream.name}
                                                    style={{
                                                        cursor: 'pointer',
                                                        background: selectedStream === stream.name ? '#243447' : undefined
                                                    }}
                                                    onClick={() => {
                                                        setSelectedStream(stream.name);
                                                        setEventSearch('')
                                                    }}
                                                >
                                                    <td>
                              <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                {selectedStream === stream.name && (
                                    <span style={{
                                        width: 3,
                                        height: 14,
                                        background: '#ff9900',
                                        borderRadius: 2,
                                        display: 'inline-block'
                                    }}/>
                                )}
                                  <span className="mono" style={{color: '#539fe5'}}>{stream.name}</span>
                              </span>
                                                    </td>
                                                    <td style={{color: '#8d9cad'}}>{timeAgo(stream.lastEventAt)}</td>
                                                    <td style={{color: '#8d9cad'}}>{formatBytes(stream.storedBytes)}</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>

                                {/* Events */}
                                <section className="table-panel">
                                    <div className="widget-header" style={{gap: 12}}>
                                        <h3>Events</h3>
                                        {selectedStream && eventsQuery.data && (
                                            <span style={{fontSize: 11, color: '#5f7080'}}>
                        {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                                                {eventSearch ? ` matching "${eventSearch}"` : ''}
                      </span>
                                        )}
                                        {selectedStream && (
                                            <div style={{
                                                marginLeft: 'auto',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}>
                                                <Search size={12} color="#5f7080"/>
                                                <input
                                                    className="input"
                                                    style={{height: 24, minWidth: 180}}
                                                    value={eventSearch}
                                                    onChange={(e) => setEventSearch(e.target.value)}
                                                    placeholder="Filter events…"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {!selectedStream ? (
                                        <EmptyState
                                            icon={Activity}
                                            title="Select a stream"
                                            description="Click a stream above to view its log events."
                                            compact
                                        />
                                    ) : eventsQuery.isLoading ? (
                                        <div className="empty compact"><p>Loading events…</p></div>
                                    ) : filteredEvents.length === 0 ? (
                                        <EmptyState
                                            icon={Activity}
                                            title={eventSearch ? 'No matching events' : 'No events'}
                                            description={eventSearch ? `No events contain "${eventSearch}".` : 'This stream has no events yet.'}
                                            compact
                                        />
                                    ) : (
                                        <div>
                                            {filteredEvents.map((event) => (
                                                <LogEventRow key={event.id} event={event}/>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </>
    )
}
