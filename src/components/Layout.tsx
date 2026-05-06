import {NavLink, Outlet} from 'react-router-dom'
import {
    AreaChart,
    Bell,
    Cpu,
    Database,
    KeyRound,
    LayoutDashboard,
    Lock,
    MessageSquare,
    Moon,
    Search,
    Shield,
    SlidersHorizontal,
    Sun,
    Table2,
    Users,
    Zap,
} from 'lucide-react'
import flociLogo from '@/assets/floci.png'
import {useTheme} from '@/lib/useTheme'
import {useQuery} from '@tanstack/react-query'
import {fetchHealth, SERVICE_META} from '@/api/services'
import {FLOCI_BASE_URL} from '@/api/floci-client'
import type {ServiceName} from '@/api/types'
import {useCloudWatchIngestor} from '@/features/cloudwatch/hooks/useCloudWatchIngestor'

const ICONS: Record<ServiceName | 'dashboard', React.ElementType> = {
    dashboard: LayoutDashboard,
    cloudwatch: AreaChart,
    s3: Database,
    sqs: MessageSquare,
    dynamodb: Table2,
    sns: Bell,
    lambda: Zap,
    secretsmanager: KeyRound,
    cognito: Users,
    rds: Database,
    elasticache: Cpu,
    iam: Shield,
    ssm: SlidersHorizontal,
    kms: Lock,
}

function NavItem({to, icon, label}: { to: string; icon: React.ElementType; label: string }) {
    const Icon = icon
    return (
        <NavLink className="nav-link" to={to}>
            <Icon size={14}/>
            <span>{label}</span>
        </NavLink>
    )
}

export function Layout() {
    const {theme, toggle} = useTheme()
    const {data, isError} = useQuery({
        queryKey: ['health'],
        queryFn: ({signal}) => fetchHealth(signal),
        refetchInterval: 5000
    })
    const status = isError ? 'unavailable' : data?.status ?? 'unknown'
    const isConnected = status === 'healthy' || status === 'degraded'
    const connectionLabel = isConnected ? 'Connected' : 'No connected'

    // Auto-ingest all Floci service activity into CloudWatch Logs
    useCloudWatchIngestor()

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">
                        <img src={flociLogo} alt="Floci" style={{width: '100%', height: '100%', objectFit: 'contain'}}/>
                    </div>
                    <div>
                        <h1>Floci</h1>
                        <p>Local Cloud</p>
                    </div>
                </div>

                <nav className="nav">
                    <div className="nav-section">
                        <span className="nav-label">General</span>
                        <NavItem to="/dashboard" icon={ICONS.dashboard} label="Console Home"/>
                    </div>
                    <div className="nav-section">
                        <span className="nav-label">Services</span>
                        {SERVICE_META.map((service) => (
                            <NavItem key={service.name} to={service.route} icon={ICONS[service.name]}
                                     label={service.displayName}/>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer">Floci DevTools · Local</div>
            </aside>

            <div className="shell">
                <header className="topbar">
                    <div className="search">
                        <Search size={14}/>
                        <input placeholder="Search services, features, docs, and more"/>
                        <span className="kbd">/</span>
                    </div>
                    <button className="icon-btn" onClick={toggle} title="Toggle theme">
                        {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
                    </button>
                    <div className={`connection ${isConnected ? 'connected' : 'disconnected'}`}
                         title={`${connectionLabel} a ${FLOCI_BASE_URL}`}>
                        <span className={`dot ${status}`}/>
                        <span className="connection-state">{connectionLabel}</span>
                        <span className="connection-target">{FLOCI_BASE_URL}</span>
                    </div>
                </header>
                <main className="main">
                    <Outlet/>
                </main>
            </div>
        </div>
    )
}
