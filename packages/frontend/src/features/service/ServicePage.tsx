import {useParams} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {Database, Info} from 'lucide-react'
import {EmptyState} from '@/components/EmptyState'
import {listServiceResources, SERVICE_META} from '@/api/services'
import type {ServiceName} from '@/api/types'

export function ServicePage() {
    const params = useParams<{ service: ServiceName }>()
    const serviceName = params.service as ServiceName
    const meta = SERVICE_META.find((svc) => svc.name === serviceName)

    const {data = [], isLoading, isError, error} = useQuery({
        queryKey: ['resources', serviceName],
        queryFn: ({signal}) => listServiceResources(serviceName, signal),
        enabled: Boolean(meta?.implemented),
    })

    if (!meta) {
        return <EmptyState icon={Database} title="Service not found"
                           description="This service is not registered in the Floci console."/>
    }

    return (
        <>
            <div className="page-header">
                <div className="page-title">
                    <h2>{meta.displayName}</h2>å
                    <span className="info-link">
            <Info size={11}/>
            Info
          </span>
                </div>
            </div>

            {!meta.implemented ? (
                <EmptyState
                    icon={Database}
                    title={`${meta.displayName} is not wired yet`}
                    description="This screen is intentionally empty until Floci exposes a real compatible endpoint for it. No sample data is shown."
                />
            ) : (
                <div className="content">
                    <div className="table-panel">
                        <div className="widget-header">
                            <h3>{meta.displayName} resources</h3>
                        </div>
                        {isError ? (
                            <EmptyState icon={Database} title="Cannot load resources"
                                        description={error instanceof Error ? error.message : 'The Floci endpoint did not respond.'}/>
                        ) : isLoading ? (
                            <div className="empty"><p>Loading resources...</p></div>
                        ) : data.length === 0 ? (
                            <EmptyState icon={Database} title="No resources found"
                                        description={`No ${meta.displayName} resources were returned by Floci.`}/>
                        ) : (
                            <table className="table">
                                <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Metadata</th>
                                </tr>
                                </thead>
                                <tbody>
                                {data.map((resource) => (
                                    <tr key={resource.id}>
                                        <td className="mono">{resource.name}</td>
                                        <td>{resource.status ?? '-'}</td>
                                        <td className="mono">{resource.metadata ? JSON.stringify(resource.metadata) : '-'}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
