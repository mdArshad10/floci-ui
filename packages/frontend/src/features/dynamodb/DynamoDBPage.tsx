import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Info, RefreshCw, Table2} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {listServiceResources, scanDynamoDbTable} from '@/api/services'
import {formatNumber} from '@/lib/utils'
import type {ResourceSummary} from '@/api/types'

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function TableMeta({table}: { table: ResourceSummary }) {
    return (
        <div style={{padding: '12px 16px', borderBottom: '1px solid #2d3f57'}}>
            <div className="metric-grid">
                <div>
                    <p className="metric-label">Status</p>
                    <p className="metric-value" style={{textTransform: 'capitalize'}}>
                        {(table.status ?? 'unknown').toLowerCase()}
                    </p>
                </div>
                <div>
                    <p className="metric-label">Items (approx.)</p>
                    <p className="metric-value">{formatNumber(table.metadata?.itemCount as number | undefined)}</p>
                </div>
                <div>
                    <p className="metric-label">Table size</p>
                    <p className="metric-value">
                        {table.metadata?.sizeBytes !== undefined ? formatBytes(table.metadata.sizeBytes as number) : '-'}
                    </p>
                </div>
                <div>
                    <p className="metric-label">Billing mode</p>
                    <p className="metric-value">{(table.metadata?.billingMode as string | undefined) ?? '-'}</p>
                </div>
            </div>
        </div>
    )
}

export function DynamoDBPage() {
    const [selectedTable, setSelectedTable] = useState<string | null>(null)
    const [limit, setLimit] = useState(50)

    const tablesQuery = useQuery({
        queryKey: ['resources', 'dynamodb'],
        queryFn: ({signal}) => listServiceResources('dynamodb', signal),
    })

    const scanQuery = useQuery({
        queryKey: ['dynamodb-scan', selectedTable, limit],
        queryFn: ({signal}) => scanDynamoDbTable(selectedTable!, limit, signal),
        enabled: Boolean(selectedTable),
    })

    const columns = scanQuery.data?.items[0] ? Object.keys(scanQuery.data.items[0]) : []
    const selectedMeta = tablesQuery.data?.find((t) => t.name === selectedTable)

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <h2>DynamoDB</h2>
                    <span className="info-link">
            <Info size={11}/>
            NoSQL database
          </span>
                </div>
                <button className="button" onClick={() => void tablesQuery.refetch()}>
                    <RefreshCw size={13}/>
                    Refresh
                </button>
            </div>

            <div className="split">
                <aside className="list-pane">
                    <div className="widget-header">
                        <Table2 size={13} color="#8d9cad"/>
                        <h3>Tables ({tablesQuery.data?.length ?? 0})</h3>
                    </div>

                    {tablesQuery.isLoading ? (
                        <div className="empty"><p>Loading tables...</p></div>
                    ) : tablesQuery.isError ? (
                        <EmptyState icon={Table2} title="Cannot load tables"
                                    description="DynamoDB did not respond from the Floci endpoint."/>
                    ) : (tablesQuery.data ?? []).length === 0 ? (
                        <EmptyState icon={Table2} title="No tables"
                                    description="Create a table with the AWS CLI to get started."/>
                    ) : (
                        tablesQuery.data?.map((table) => (
                            <button
                                key={table.id}
                                className={`list-item ${selectedTable === table.name ? 'active' : ''}`}
                                onClick={() => setSelectedTable(table.name)}
                            >
                                <strong>{table.name}</strong>
                                <span>
                  {formatNumber(table.metadata?.itemCount as number | undefined)} items
                                    {table.metadata?.billingMode ? ` · ${table.metadata.billingMode}` : ''}
                </span>
                            </button>
                        ))
                    )}
                </aside>

                <section className="detail-pane">
                    {!selectedTable ? (
                        <div className="empty" style={{minHeight: 400}}>
                            <div className="empty-icon"><Table2 size={24}/></div>
                            <h3>Select a table</h3>
                            <p>Choose a table from the list to browse its items.</p>
                        </div>
                    ) : (
                        <>
                            <div className="page-header">
                                <div className="page-title">
                                    <h2 style={{fontSize: 16}}>{selectedTable}</h2>
                                </div>
                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <span style={{color: '#8d9cad', fontSize: 12}}>Limit</span>
                                    <select
                                        className="input"
                                        style={{minWidth: 'unset', width: 72}}
                                        value={limit}
                                        onChange={(e) => setLimit(Number(e.target.value))}
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                    <button className="button" onClick={() => void scanQuery.refetch()}>
                                        <RefreshCw size={13}/>
                                        Scan
                                    </button>
                                </div>
                            </div>

                            {selectedMeta && <TableMeta table={selectedMeta}/>}

                            <div className="content" style={{paddingTop: 12}}>
                                <div className="table-panel">
                                    <div className="widget-header">
                                        <h3>Items</h3>
                                        {scanQuery.data && (
                                            <span style={{marginLeft: 'auto', color: '#5f7080', fontSize: 11}}>
                        {scanQuery.data.count} returned · {scanQuery.data.scannedCount} scanned
                      </span>
                                        )}
                                    </div>

                                    {scanQuery.isLoading ? (
                                        <div className="empty"><p>Scanning table...</p></div>
                                    ) : scanQuery.isError ? (
                                        <EmptyState icon={Table2} title="Scan failed"
                                                    description="Could not scan this table."/>
                                    ) : !scanQuery.data || scanQuery.data.items.length === 0 ? (
                                        <EmptyState icon={Table2} title="Table is empty"
                                                    description="No items were returned by the scan."/>
                                    ) : (
                                        <div style={{overflowX: 'auto'}}>
                                            <table className="table">
                                                <thead>
                                                <tr>
                                                    {columns.map((col) => <th key={col}>{col}</th>)}
                                                </tr>
                                                </thead>
                                                <tbody>
                                                {scanQuery.data.items.map((item, i) => (
                                                    <tr key={i}>
                                                        {columns.map((col) => (
                                                            <td key={col} className="mono">
                                                                {item[col] === null
                                                                    ? <span style={{color: '#5f7080'}}>null</span>
                                                                    : item[col] === undefined
                                                                        ? <span style={{color: '#5f7080'}}>-</span>
                                                                        : typeof item[col] === 'object'
                                                                            ? JSON.stringify(item[col])
                                                                            : String(item[col])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </>
    )
}
