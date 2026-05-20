import {useEffect, useRef, useState} from 'react'
import {ChevronLeft, ChevronRight, Copy, Download, File, Folder, Loader2, RefreshCw, Trash2, Upload} from 'lucide-react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
    copyStorageObject,
    createCloudResource,
    deleteStorageObject,
    listCloudResources,
    listStorageObjects,
    storageObjectDownloadUrl,
    uploadStorageObject,
} from '@/api/cloudProxyClient'
import {capabilityEnabled, capabilityFor, normalizeCapabilities, withRuntimeState} from '@/lib/capabilities'
import type {CloudProvider} from '@/types/cloud'
import type {CloudResource, StorageObject} from '@/types/resource'
import type {CapabilitySchema, ObjectActionName} from '@/types/schema'

interface StorageObjectBrowserProps {
    cloud: CloudProvider
    resource?: CloudResource
    capabilities?: Array<CapabilitySchema<ObjectActionName> | ObjectActionName>
    runtimeReachable?: boolean
    selectedObjectKey?: string
    onSelectObject: (object?: StorageObject) => void
}

export function StorageObjectBrowser({cloud, resource, capabilities = [], runtimeReachable = false, selectedObjectKey, onSelectObject}: StorageObjectBrowserProps) {
    const qc = useQueryClient()
    const fileRef = useRef<HTMLInputElement | null>(null)
    const [prefix, setPrefix] = useState('')
    const [uploadPrefix, setUploadPrefix] = useState('')
    const [folderName, setFolderName] = useState('')
    const [createFolderOpen, setCreateFolderOpen] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [copyObject, setCopyObject] = useState<StorageObject | null>(null)

    const resolvedCapabilities = withRuntimeState(normalizeCapabilities(capabilities), runtimeReachable)
    const uploadCapability = capabilityFor(resolvedCapabilities, 'upload')
    const downloadCapability = capabilityFor(resolvedCapabilities, 'download')
    const deleteCapability = capabilityFor(resolvedCapabilities, 'delete')
    const createFolderCapability = capabilityFor(resolvedCapabilities, 'createFolder')
    const copyCapability = capabilityFor(resolvedCapabilities, 'copy')
    const canUpload = capabilityEnabled(uploadCapability)
    const canDownload = capabilityEnabled(downloadCapability)
    const canDelete = capabilityEnabled(deleteCapability)
    const canCreateFolder = capabilityEnabled(createFolderCapability)
    const canCopy = capabilityEnabled(copyCapability)

    useEffect(() => {
        setPrefix('')
        setUploadPrefix('')
        setFolderName('')
        setCreateFolderOpen(false)
        setDeleteConfirm(null)
        setCopyObject(null)
        onSelectObject(undefined)
    }, [resource?.id, onSelectObject])

    const query = useQuery({
        queryKey: ['storage-objects', cloud, resource?.id, prefix],
        queryFn: ({signal}) => listStorageObjects(cloud, resource?.id ?? '', prefix, signal),
        enabled: !!resource,
    })

    const uploadMut = useMutation({
        mutationFn: async (file: File) => {
            if (!resource) return
            const key = `${uploadPrefix || prefix}${file.name}`
            await uploadStorageObject(cloud, resource.id, key, file)
        },
        onSuccess: () => qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]}),
    })

    const createFolderMut = useMutation({
        mutationFn: async (name: string) => {
            if (!resource) return
            const folderKey = `${prefix}${normalizeFolderName(name)}`
            await uploadStorageObject(cloud, resource.id, folderKey, new Blob([], {type: 'application/x-directory'}))
        },
        onSuccess: () => {
            setFolderName('')
            setCreateFolderOpen(false)
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]})
        },
    })

    const deleteMut = useMutation({
        mutationFn: async (object: StorageObject) => {
            if (!resource) return
            await deleteStorageObject(cloud, resource.id, object.key)
        },
        onSuccess: () => qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]}),
    })

    const moveCopyMut = useMutation({
        mutationFn: async ({srcKey, destKey, destResourceId, mode}: {
            srcKey: string; destKey: string; destResourceId?: string; mode: 'move' | 'copy'
        }) => {
            if (!resource) return
            await copyStorageObject(cloud, resource.id, srcKey, destKey, destResourceId)
            if (mode === 'move') await deleteStorageObject(cloud, resource.id, srcKey)
        },
        onSuccess: (_, vars) => {
            setCopyObject(null)
            if (vars.mode === 'move') onSelectObject(undefined)
            void qc.invalidateQueries({queryKey: ['storage-objects', cloud, resource?.id]})
            if (vars.destResourceId) void qc.invalidateQueries({queryKey: ['storage-objects', cloud, vars.destResourceId]})
        },
    })

    if (!resource) {
        return (
            <section className="object-browser empty compact">
                <h3>Select a storage resource</h3>
                <p>Choose a bucket or container to browse objects and blobs.</p>
            </section>
        )
    }

    const objects = query.data?.objects ?? []
    const error = query.error ?? uploadMut.error ?? createFolderMut.error ?? deleteMut.error ?? moveCopyMut.error
    const folders = objects.filter((object) => object.type === 'folder').length
    const files = objects.length - folders
    const objectLabel = cloud === 'azure' ? 'blobs' : 'objects'

    return (
        <section className="object-browser">
            {copyObject && resource && (
                <MoveOrCopyModal
                    cloud={cloud}
                    resource={resource}
                    srcObject={copyObject}
                    canCopy={canCopy}
                    isPending={moveCopyMut.isPending}
                    error={moveCopyMut.error instanceof Error ? moveCopyMut.error.message : null}
                    onClose={() => { setCopyObject(null); moveCopyMut.reset() }}
                    onConfirm={(destKey, destResourceId, mode) => moveCopyMut.mutate({srcKey: copyObject.key, destKey, destResourceId, mode})}
                />
            )}

            <div className="object-browser-header">
                <div>
                    <p className="eyebrow">Objects</p>
                    <h3>{resource.name}</h3>
                    <div className="object-browser-subtitle">
                        <ObjectBreadcrumb prefix={prefix} onNavigate={(nextPrefix) => {
                            setPrefix(nextPrefix)
                            onSelectObject(undefined)
                        }}/>
                        <span>{folders} folders, {files} {objectLabel}</span>
                    </div>
                </div>
                <div className="object-browser-actions">
                    {prefix && (
                        <button className="button" type="button" onClick={() => {
                            setPrefix(parentPrefix(prefix))
                            onSelectObject(undefined)
                        }}>
                            <ChevronLeft size={14}/>
                            Back
                        </button>
                    )}
                    {createFolderCapability && (
                        <button className="button" type="button" disabled={!canCreateFolder} title={createFolderCapability.reason} onClick={() => setCreateFolderOpen((open) => !open)}>
                            <Folder size={14}/>
                            New folder
                        </button>
                    )}
                    {uploadCapability && (
                        <>
                            <input className="input object-prefix-input" value={uploadPrefix} onChange={(event) => setUploadPrefix(normalizePrefix(event.target.value))} placeholder={prefix ? `Upload to ${prefix}` : 'Upload prefix'}/>
                            <input ref={fileRef} type="file" hidden onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) uploadMut.mutate(file)
                                event.currentTarget.value = ''
                            }}/>
                            <button className="button" type="button" disabled={!canUpload} title={uploadCapability.reason} onClick={() => fileRef.current?.click()}>
                                <Upload size={14}/>
                                {uploadMut.isPending ? 'Uploading' : 'Upload'}
                            </button>
                        </>
                    )}
                    <button className="button" type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
                        <RefreshCw size={14}/>
                        {query.isFetching ? 'Loading' : 'Refresh'}
                    </button>
                </div>
            </div>

            {createFolderOpen && (
                <form className="object-create-folder" onSubmit={(event) => {
                    event.preventDefault()
                    if (folderName.trim()) createFolderMut.mutate(folderName)
                }}>
                    <label>
                        <span>Folder name</span>
                        <input className="input" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={prefix ? `${prefix}new-folder/` : 'new-folder/'}/>
                    </label>
                    <button className="button primary" type="submit" disabled={createFolderMut.isPending || !folderName.trim()}>
                        <Folder size={14}/>
                        {createFolderMut.isPending ? 'Creating' : 'Create folder'}
                    </button>
                </form>
            )}

            {error && (
                <div className="inline-error">
                    {error instanceof Error ? error.message : 'Storage operation failed'}
                </div>
            )}

            {query.isLoading ? (
                <div className="empty compact">
                    <h3>Loading objects</h3>
                    <p>Reading objects from the selected storage resource.</p>
                </div>
            ) : objects.length === 0 ? (
                <div className="empty compact">
                    <h3>No {objectLabel}</h3>
                    <p>{prefix ? `The ${prefix} prefix is empty.` : `This ${resource.type} has no ${objectLabel} yet.`}</p>
                </div>
            ) : (
                <table className="table object-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Last Modified</th>
                            <th aria-label="Actions"/>
                        </tr>
                    </thead>
                    <tbody>
                        {objects.map((object) => (
                            <tr key={object.key} className={selectedObjectKey === object.key ? 'selected' : ''}>
                                <td onClick={() => {
                                    if (object.type === 'folder') {
                                        setPrefix(object.key)
                                        onSelectObject(undefined)
                                    } else {
                                        onSelectObject(object)
                                    }
                                }}>
                                    <span className="object-name">
                                        {object.type === 'folder' ? <Folder size={14}/> : <File size={14}/>}
                                        {object.name}
                                        {object.type === 'folder' && <ChevronRight size={12}/>}
                                    </span>
                                </td>
                                <td>{object.type}</td>
                                <td>{object.size === null ? '-' : formatBytes(object.size)}</td>
                                <td>{object.lastModified ?? '-'}</td>
                                <td className="table-actions">
                                    {object.type === 'object' && (
                                        <>
                                            {downloadCapability && (
                                                <a className={`icon-btn ${canDownload ? '' : 'disabled'}`} href={canDownload ? storageObjectDownloadUrl(cloud, resource.id, object.key) : undefined} title={downloadCapability.reason ?? `Download ${object.name}`}>
                                                    <Download size={13}/>
                                                </a>
                                            )}
                                            {copyCapability && (
                                                <button className="icon-btn" disabled={!canCopy} title={copyCapability.reason ?? `Copy ${object.name}`} onClick={() => setCopyObject(object)}>
                                                    <Copy size={13}/>
                                                </button>
                                            )}
                                            {canDelete && deleteConfirm === object.key ? (
                                                <button className="button danger compact" disabled={deleteMut.isPending} onClick={() => {
                                                    deleteMut.mutate(object)
                                                    setDeleteConfirm(null)
                                                    onSelectObject(undefined)
                                                }}>
                                                    Confirm
                                                </button>
                                            ) : (
                                                deleteCapability && <button className="icon-btn danger" disabled={!canDelete} title={deleteCapability.reason ?? `Delete ${object.name}`} onClick={() => setDeleteConfirm(object.key)}>
                                                    <Trash2 size={13}/>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    )
}

// ─── Copy modal ───────────────────────────────────────────────────────────────

const NEW_RESOURCE_SENTINEL = '__new__'

function MoveOrCopyModal({
    cloud,
    resource,
    srcObject,
    canCopy,
    isPending,
    error,
    onClose,
    onConfirm,
}: {
    cloud: CloudProvider
    resource: CloudResource
    srcObject: StorageObject
    canCopy: boolean
    isPending: boolean
    error: string | null
    onClose: () => void
    onConfirm: (destKey: string, destResourceId: string | undefined, mode: 'move' | 'copy') => void
}) {
    const qc = useQueryClient()
    const resourceLabel = cloud === 'azure' ? 'container' : 'bucket'
    const [mode, setMode] = useState<'move' | 'copy'>('move')
    const [destKey, setDestKey] = useState(() => {
        const parts = srcObject.key.split('/')
        const filename = parts.pop() ?? srcObject.key
        const dir = parts.join('/')
        return dir ? `${dir}/copy-of-${filename}` : `copy-of-${filename}`
    })
    const [destResourceId, setDestResourceId] = useState(resource.id)
    const [newResourceName, setNewResourceName] = useState('')

    const resourcesQuery = useQuery({
        queryKey: ['cloud-resources', cloud, 'storage'],
        queryFn: ({signal}) => listCloudResources(cloud, 'storage', undefined, signal),
    })

    const createResourceMut = useMutation({
        mutationFn: () => {
            const nameField = cloud === 'azure' ? 'containerName' : 'bucketName'
            return createCloudResource(cloud, 'storage', {[nameField]: newResourceName.trim()})
        },
        onSuccess: (created) => {
            setDestResourceId(created.id)
            setNewResourceName('')
            void qc.invalidateQueries({queryKey: ['cloud-resources', cloud, 'storage']})
        },
    })

    const isCreatingNew = destResourceId === NEW_RESOURCE_SENTINEL
    const resources = resourcesQuery.data ?? []
    const resolvedDestId = isCreatingNew ? undefined : (destResourceId !== resource.id ? destResourceId : undefined)

    return (
        <div className="copy-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className="copy-modal">
                {/* Mode toggle */}
                <div className="drawer-tabs" style={{marginBottom: 14}}>
                    <button className={`drawer-tab ${mode === 'move' ? 'active' : ''}`} onClick={() => setMode('move')}>
                        Move
                    </button>
                    <button className={`drawer-tab ${mode === 'copy' ? 'active' : ''}`} onClick={() => setMode('copy')}>
                        Copy
                    </button>
                </div>

                <div style={{fontSize: 12, color: '#8d9cad', marginBottom: 12}}>
                    Source: <span className="mono" style={{color: '#d1d1d1'}}>{resource.name}/{srcObject.key}</span>
                </div>

                {/* Destination resource */}
                <div className="form-row">
                    <label>Destination {resourceLabel}</label>
                    {resourcesQuery.isLoading ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8d9cad'}}>
                            <Loader2 size={13}/> Loading {resourceLabel}s…
                        </div>
                    ) : (
                        <select
                            className="input"
                            value={destResourceId}
                            onChange={(e) => setDestResourceId(e.target.value)}
                        >
                            {resources.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}{r.id === resource.id ? ' (current)' : ''}
                                </option>
                            ))}
                            <option value={NEW_RESOURCE_SENTINEL}>+ New {resourceLabel}…</option>
                        </select>
                    )}
                </div>

                {/* Inline create new resource */}
                {isCreatingNew && (
                    <div style={{display: 'flex', gap: 6, alignItems: 'center', marginTop: -6, marginBottom: 4}}>
                        <input
                            className="input"
                            autoFocus
                            value={newResourceName}
                            onChange={(e) => setNewResourceName(e.target.value.toLowerCase().replace(cloud === 'azure' ? /[^a-z0-9-]/g : /[^a-z0-9.-]/g, ''))}
                            placeholder={`new-${resourceLabel}-name`}
                            onKeyDown={(e) => { if (e.key === 'Enter' && newResourceName.trim().length >= 3) createResourceMut.mutate() }}
                        />
                        <button
                            className="button primary"
                            disabled={newResourceName.trim().length < 3 || createResourceMut.isPending}
                            onClick={() => createResourceMut.mutate()}
                        >
                            {createResourceMut.isPending ? <Loader2 size={13}/> : 'Create'}
                        </button>
                    </div>
                )}
                {createResourceMut.isError && (
                    <p style={{fontSize: 12, color: '#f87171', margin: '0 0 6px'}}>{createResourceMut.error instanceof Error ? createResourceMut.error.message : 'Create failed'}</p>
                )}

                {/* Destination key */}
                <div className="form-row">
                    <label>Destination key</label>
                    <input className="input" value={destKey} onChange={(e) => setDestKey(e.target.value)}/>
                </div>

                {error && <p style={{fontSize: 12, color: '#f87171', margin: '0 0 4px'}}>{error}</p>}

                <div className="copy-modal-footer">
                    <button className="button" onClick={onClose} disabled={isPending}>Cancel</button>
                    <button
                        className="button primary"
                        disabled={!destKey.trim() || isCreatingNew || !canCopy || isPending}
                        onClick={() => onConfirm(destKey, resolvedDestId, mode)}
                    >
                        {isPending ? <Loader2 size={13}/> : <Copy size={13}/>}
                        {mode === 'move' ? 'Move' : 'Copy'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function ObjectBreadcrumb({prefix, onNavigate}: {prefix: string; onNavigate: (prefix: string) => void}) {
    const segments = prefix ? prefix.replace(/\/$/, '').split('/') : []
    return (
        <div className="object-breadcrumb">
            <button type="button" onClick={() => onNavigate('')}>Root</button>
            {segments.map((segment, index) => {
                const path = `${segments.slice(0, index + 1).join('/')}/`
                return (
                    <span key={path}>
                        <ChevronRight size={11}/>
                        <button type="button" onClick={() => onNavigate(path)}>{segment}</button>
                    </span>
                )
            })}
        </div>
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePrefix(value: string): string {
    const trimmed = value.trim().replace(/^\/+/, '')
    return trimmed && !trimmed.endsWith('/') ? `${trimmed}/` : trimmed
}

function normalizeFolderName(value: string): string {
    const normalized = value.trim().replace(/^\/+/, '')
    return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function parentPrefix(prefix: string): string {
    const segments = prefix.replace(/\/$/, '').split('/').filter(Boolean)
    segments.pop()
    return segments.length ? `${segments.join('/')}/` : ''
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
