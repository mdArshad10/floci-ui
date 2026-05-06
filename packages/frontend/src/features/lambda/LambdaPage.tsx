import {useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Info, RefreshCw, Search, Zap} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {listServiceResources} from '@/api/services'
import {timeAgo} from '@/lib/utils'

// ─── Runtime badge ────────────────────────────────────────────────────────────

const RUNTIME_COLORS: Record<string, { bg: string; color: string }> = {
    python: {bg: 'rgba(59,130,246,0.18)', color: '#60a5fa'},
    nodejs: {bg: 'rgba(34,197,94,0.18)', color: '#4ade80'},
    node: {bg: 'rgba(34,197,94,0.18)', color: '#4ade80'},
    java: {bg: 'rgba(239,68,68,0.18)', color: '#f87171'},
    go: {bg: 'rgba(6,182,212,0.18)', color: '#22d3ee'},
    dotnet: {bg: 'rgba(168,85,247,0.18)', color: '#c084fc'},
    provided: {bg: 'rgba(249,115,22,0.18)', color: '#fb923c'},
    ruby: {bg: 'rgba(236,72,153,0.18)', color: '#f472b6'},
}

function runtimeStyle(runtime?: string) {
    if (!runtime) return {bg: 'rgba(107,114,128,0.18)', color: '#9ca3af'}
    const key = Object.keys(RUNTIME_COLORS).find((k) => runtime.toLowerCase().startsWith(k))
    return key ? RUNTIME_COLORS[key] : {bg: 'rgba(107,114,128,0.18)', color: '#9ca3af'}
}

function RuntimeBadge({runtime}: { runtime?: string }) {
    if (!runtime) return null
    const {bg, color} = runtimeStyle(runtime)
    return (
        <span className="badge" style={{background: bg, color}}>
      {runtime}
    </span>
    )
}

// ─── State badge ─────────────────────────────────────────────────────────────

const STATE_STYLES: Record<string, { bg: string; color: string; dot: string }> = {
    active: {bg: 'rgba(34,197,94,0.14)', color: '#4ade80', dot: '#22c55e'},
    pending: {bg: 'rgba(245,158,11,0.14)', color: '#fbbf24', dot: '#f59e0b'},
    failed: {bg: 'rgba(239,68,68,0.14)', color: '#f87171', dot: '#ef4444'},
    inactive: {bg: 'rgba(107,114,128,0.14)', color: '#9ca3af', dot: '#6b7280'},
}

function StateBadge({state}: { state?: string }) {
    const key = (state ?? 'active').toLowerCase()
    const style = STATE_STYLES[key] ?? STATE_STYLES.active
    return (
        <span className="badge" style={{background: style.bg, color: style.color}}>
      <span style={{width: 6, height: 6, borderRadius: '50%', background: style.dot, display: 'inline-block'}}/>
            {state ?? 'Active'}
    </span>
    )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
    if (!bytes) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ─── Function card ────────────────────────────────────────────────────────────

function FnCard({fn}: { fn: ReturnType<typeof buildFn> }) {
    return (
        <div className="fn-card">
            <div className="fn-card-name">
                <Zap size={14} color="#ff9900" style={{flexShrink: 0, marginTop: 2}}/>
                <h3>{fn.name}</h3>
            </div>

            {fn.description && (
                <p style={{margin: 0, fontSize: 11, color: '#5f7080', lineHeight: 1.4}}>
                    {fn.description}
                </p>
            )}

            <div className="fn-badges">
                <RuntimeBadge runtime={fn.runtime}/>
                <StateBadge state={fn.state}/>
            </div>

            <div className="fn-meta">
                <div className="fn-meta-item">
                    <span className="fn-meta-label">Handler</span>
                    <span className="fn-meta-value">{fn.handler ?? '-'}</span>
                </div>
                <div className="fn-meta-item">
                    <span className="fn-meta-label">Memory</span>
                    <span className="fn-meta-value">{fn.memoryMb ? `${fn.memoryMb} MB` : '-'}</span>
                </div>
                <div className="fn-meta-item">
                    <span className="fn-meta-label">Timeout</span>
                    <span className="fn-meta-value">{fn.timeoutSec ? `${fn.timeoutSec}s` : '-'}</span>
                </div>
                <div className="fn-meta-item">
                    <span className="fn-meta-label">Code size</span>
                    <span className="fn-meta-value">{formatBytes(fn.codeSize)}</span>
                </div>
                <div className="fn-meta-item" style={{gridColumn: 'span 2'}}>
                    <span className="fn-meta-label">Last modified</span>
                    <span className="fn-meta-value" style={{color: '#8d9cad'}}>{timeAgo(fn.lastModified)}</span>
                </div>
            </div>
        </div>
    )
}

// ─── Data shaping ─────────────────────────────────────────────────────────────

function buildFn(r: {
    id: string;
    name: string;
    status?: string;
    description?: string;
    metadata?: Record<string, string | number | undefined>
}) {
    return {
        id: r.id,
        name: r.name,
        state: r.status,
        description: r.description?.includes('/') || r.description?.includes('::') ? undefined : r.description,
        runtime: r.metadata?.runtime as string | undefined,
        handler: r.metadata?.handler as string | undefined,
        memoryMb: r.metadata?.memoryMb as number | undefined,
        timeoutSec: r.metadata?.timeoutSec as number | undefined,
        codeSize: r.metadata?.codeSize as number | undefined,
        lastModified: r.metadata?.lastModified as string | undefined,
    }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LambdaPage() {
    const [search, setSearch] = useState('')

    const query = useQuery({
        queryKey: ['resources', 'lambda'],
        queryFn: ({signal}) => listServiceResources('lambda', signal),
    })

    const functions = useMemo(() => {
        const all = (query.data ?? []).map(buildFn)
        if (!search) return all
        const q = search.toLowerCase()
        return all.filter((fn) => fn.name.toLowerCase().includes(q) || fn.runtime?.toLowerCase().includes(q))
    }, [query.data, search])

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <h2>Lambda</h2>
                    <span className="info-link">
            <Info size={11}/>
                        {query.data ? `${query.data.length} functions` : 'Serverless functions'}
          </span>
                </div>
                <button className="button" onClick={() => void query.refetch()}>
                    <RefreshCw size={13}/>
                    Refresh
                </button>
            </div>

            <div className="input-row">
                <Search size={14} color="#8d9cad"/>
                <input
                    className="input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search functions by name or runtime..."
                />
            </div>

            <div className="content">
                {query.isError ? (
                    <EmptyState icon={Zap} title="Cannot load functions"
                                description="Lambda did not respond from the Floci endpoint."/>
                ) : query.isLoading ? (
                    <div className="empty"><p>Loading functions...</p></div>
                ) : functions.length === 0 ? (
                    <EmptyState
                        icon={Zap}
                        title={search ? 'No functions match your search' : 'No Lambda functions'}
                        description={search ? `Try a different name or runtime filter.` : 'Deploy a function with the AWS CLI to get started.'}
                    />
                ) : (
                    <div className="fn-grid">
                        {functions.map((fn) => <FnCard key={fn.id} fn={fn}/>)}
                    </div>
                )}
            </div>
        </>
    )
}
