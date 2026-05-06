import {useState} from 'react'
import {useMutation, useQuery} from '@tanstack/react-query'
import {CheckCircle2, Eye, Info, MessageSquare, RefreshCw, Send, XCircle} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {getSqsQueueAttributes, listServiceResources, peekSqsMessages, sendSqsMessage} from '@/api/services'
import {timeAgo} from '@/lib/utils'

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatSeconds(s: number): string {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return `${Math.floor(s / 86400)}d`
}

// ─── Send-message panel ───────────────────────────────────────────────────────

function SendPanel({queueUrl, onClose}: { queueUrl: string; onClose: () => void }) {
    const [body, setBody] = useState('')
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

    const mutation = useMutation({
        mutationFn: () => sendSqsMessage(queueUrl, body),
        onSuccess: (messageId) => {
            setResult({ok: true, text: `Sent · MessageId: ${messageId}`})
            setBody('')
        },
        onError: (err) => {
            setResult({ok: false, text: err instanceof Error ? err.message : 'Send failed'})
        },
    })

    return (
        <section className="widget send-panel">
            <div className="widget-header">
                <Send size={13} color="#8d9cad"/>
                <h3>Send message</h3>
                <button
                    style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        color: '#5f7080',
                        cursor: 'pointer'
                    }}
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <div className="widget-body" style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        <textarea
            value={body}
            onChange={(e) => {
                setBody(e.target.value);
                setResult(null)
            }}
            placeholder='Message body — plain text or JSON, e.g. {"event":"test"}'
        />
                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                    <button
                        className="button primary"
                        disabled={!body.trim() || mutation.isPending}
                        onClick={() => mutation.mutate()}
                    >
                        <Send size={13}/>
                        {mutation.isPending ? 'Sending…' : 'Send'}
                    </button>
                    {result && (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: result.ok ? '#4ade80' : '#f87171'
                        }}>
              {result.ok ? <CheckCircle2 size={13}/> : <XCircle size={13}/>}
                            {result.text}
            </span>
                    )}
                </div>
            </div>
        </section>
    )
}

// ─── Peek messages panel ──────────────────────────────────────────────────────

function PeekPanel({queueUrl}: { queueUrl: string }) {
    const query = useQuery({
        queryKey: ['sqs-peek', queueUrl],
        queryFn: ({signal}) => peekSqsMessages(queueUrl, 10, signal),
        enabled: false, // only fetch on demand
    })

    return (
        <section className="widget">
            <div className="widget-header">
                <Eye size={13} color="#8d9cad"/>
                <h3>Messages</h3>
                {query.data && (
                    <span style={{fontSize: 11, color: '#5f7080', marginLeft: 4}}>
            {query.data.length} peeked
          </span>
                )}
                <button
                    className="button"
                    style={{marginLeft: 'auto'}}
                    onClick={() => void query.refetch()}
                    disabled={query.isFetching}
                >
                    <Eye size={12}/>
                    {query.isFetching ? 'Peeking…' : 'Peek (up to 10)'}
                </button>
            </div>

            {query.isFetching ? (
                <div className="empty compact"><p>Fetching messages…</p></div>
            ) : query.isError ? (
                <div className="empty compact">
                    <p style={{color: '#f87171'}}>Failed to
                        peek: {query.error instanceof Error ? query.error.message : 'Unknown error'}</p>
                </div>
            ) : !query.data ? (
                <div className="empty compact">
                    <p>Click <strong>Peek</strong> to inspect queued messages without consuming them.</p>
                </div>
            ) : query.data.length === 0 ? (
                <div className="empty compact"><p>Queue is empty.</p></div>
            ) : (
                <table className="table">
                    <thead>
                    <tr>
                        <th style={{width: 200}}>Message ID</th>
                        <th>Body</th>
                        <th style={{width: 110}}>Sent</th>
                        <th style={{width: 70}}>Receive #</th>
                    </tr>
                    </thead>
                    <tbody>
                    {query.data.map((msg) => (
                        <tr key={msg.messageId}>
                            <td className="mono" style={{fontSize: 11, color: '#5f7080'}}>{msg.messageId}</td>
                            <td className="mono" style={{
                                fontSize: 12,
                                maxWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {msg.body}
                            </td>
                            <td style={{color: '#8d9cad'}}>{timeAgo(msg.sentTimestamp)}</td>
                            <td style={{textAlign: 'right'}}>{msg.receiveCount ?? '-'}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </section>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SQSPage() {
    const [selected, setSelected] = useState<{ name: string; url: string } | null>(null)
    const [showSend, setShowSend] = useState(false)

    const queuesQuery = useQuery({
        queryKey: ['resources', 'sqs'],
        queryFn: ({signal}) => listServiceResources('sqs', signal),
    })

    const attrQuery = useQuery({
        queryKey: ['sqs-attrs', selected?.url],
        queryFn: ({signal}) => getSqsQueueAttributes(selected!.url, signal),
        enabled: Boolean(selected?.url),
    })

    function selectQueue(name: string, url: string) {
        setSelected({name, url})
        setShowSend(false)
    }

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <h2>SQS</h2>
                    <span className="info-link">
            <Info size={11}/>
            Simple Queue Service
          </span>
                </div>
                <button className="button" onClick={() => void queuesQuery.refetch()}>
                    <RefreshCw size={13}/>
                    Refresh
                </button>
            </div>

            <div className="split">
                {/* Left — queue list */}
                <aside className="list-pane">
                    <div className="widget-header">
                        <MessageSquare size={13} color="#8d9cad"/>
                        <h3>Queues ({queuesQuery.data?.length ?? 0})</h3>
                    </div>

                    {queuesQuery.isLoading ? (
                        <div className="empty"><p>Loading queues...</p></div>
                    ) : queuesQuery.isError ? (
                        <EmptyState icon={MessageSquare} title="Cannot load queues"
                                    description="SQS did not respond from the Floci endpoint."/>
                    ) : (queuesQuery.data ?? []).length === 0 ? (
                        <EmptyState icon={MessageSquare} title="No queues"
                                    description="Create a queue with the AWS CLI to get started."/>
                    ) : (
                        queuesQuery.data?.map((queue) => {
                            const queueUrl = (queue.metadata?.queueUrl as string | undefined) ?? queue.id
                            return (
                                <button
                                    key={queue.id}
                                    className={`list-item ${selected?.name === queue.name ? 'active' : ''}`}
                                    onClick={() => selectQueue(queue.name, queueUrl)}
                                >
                                    <strong>{queue.name}</strong>
                                    <span style={{
                                        fontSize: 11,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>{queueUrl}</span>
                                </button>
                            )
                        })
                    )}
                </aside>

                {/* Right — queue detail */}
                <section className="detail-pane">
                    {!selected ? (
                        <div className="empty" style={{minHeight: 400}}>
                            <div className="empty-icon"><MessageSquare size={24}/></div>
                            <h3>Select a queue</h3>
                            <p>Choose a queue from the list to view its attributes and messages.</p>
                        </div>
                    ) : (
                        <>
                            <div className="page-header">
                                <div className="page-title">
                                    <h2 style={{fontSize: 16}}>{selected.name}</h2>
                                    {attrQuery.data?.fifoQueue && (
                                        <span style={{
                                            fontSize: 11,
                                            padding: '2px 6px',
                                            border: '1px solid #2d3f57',
                                            borderRadius: 4,
                                            color: '#539fe5'
                                        }}>
                      FIFO
                    </span>
                                    )}
                                </div>
                                <div style={{display: 'flex', gap: 8}}>
                                    <button className="button primary" onClick={() => setShowSend((v) => !v)}>
                                        <Send size={13}/>
                                        {showSend ? 'Hide send' : 'Send message'}
                                    </button>
                                    <button className="button" onClick={() => void attrQuery.refetch()}>
                                        <RefreshCw size={13}/>
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            <div className="content" style={{paddingTop: 12}}>
                                <div className="grid" style={{gap: 14}}>

                                    {/* Send panel */}
                                    {showSend &&
                                        <SendPanel queueUrl={selected.url} onClose={() => setShowSend(false)}/>}

                                    {/* Attributes */}
                                    {attrQuery.isLoading ? (
                                        <div className="empty"><p>Loading attributes...</p></div>
                                    ) : attrQuery.isError ? (
                                        <EmptyState icon={MessageSquare} title="Cannot load attributes"
                                                    description="Failed to fetch queue attributes."/>
                                    ) : (
                                        <div className="grid two">
                                            <section className="widget">
                                                <div className="widget-header"><h3>Message counts</h3></div>
                                                <div className="widget-body">
                                                    <div className="metric-grid">
                                                        <div>
                                                            <p className="metric-label">Available</p>
                                                            <p className="metric-value"
                                                               style={{color: (attrQuery.data?.approximateNumberOfMessages ?? 0) > 0 ? '#4ade80' : undefined}}>
                                                                {attrQuery.data?.approximateNumberOfMessages ?? 0}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">In-flight</p>
                                                            <p className="metric-value">{attrQuery.data?.approximateNumberOfMessagesNotVisible ?? 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">Delayed</p>
                                                            <p className="metric-value">{attrQuery.data?.approximateNumberOfMessagesDelayed ?? 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">Deduplication</p>
                                                            <p className="metric-value">{attrQuery.data?.contentBasedDeduplication ? 'Content-based' : 'Off'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="widget">
                                                <div className="widget-header"><h3>Configuration</h3></div>
                                                <div className="widget-body">
                                                    <div className="metric-grid">
                                                        <div>
                                                            <p className="metric-label">Visibility timeout</p>
                                                            <p className="metric-value">
                                                                {attrQuery.data?.visibilityTimeout !== undefined ? formatSeconds(attrQuery.data.visibilityTimeout) : '-'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">Max msg size</p>
                                                            <p className="metric-value">
                                                                {attrQuery.data?.maximumMessageSize !== undefined ? formatBytes(attrQuery.data.maximumMessageSize) : '-'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">Retention</p>
                                                            <p className="metric-value">
                                                                {attrQuery.data?.messageRetentionPeriod !== undefined ? formatSeconds(attrQuery.data.messageRetentionPeriod) : '-'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="metric-label">Receive wait</p>
                                                            <p className="metric-value">
                                                                {attrQuery.data?.receiveMessageWaitTimeSeconds !== undefined ? `${attrQuery.data.receiveMessageWaitTimeSeconds}s` : '-'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="widget span-two">
                                                <div className="widget-header"><h3>Queue URL</h3></div>
                                                <div className="widget-body">
                                                    <code className="mono" style={{
                                                        wordBreak: 'break-all',
                                                        color: '#539fe5',
                                                        fontSize: 12
                                                    }}>
                                                        {selected.url}
                                                    </code>
                                                </div>
                                            </section>
                                        </div>
                                    )}

                                    {/* Peek messages */}
                                    <PeekPanel queueUrl={selected.url}/>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </>
    )
}
