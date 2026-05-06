import {apiDelete, apiGet, apiPost, apiPut, API_BASE} from './floci-client'
import type {
    ConsoleOverview,
    CWAlarm,
    CWLogEvent,
    CWLogGroup,
    CWLogStream,
    CWMetric,
    HealthReport,
    ResourceSummary,
    ServiceName,
    ServiceResourceSnapshot,
} from './types'

export const SERVICE_META: Array<{
    name: ServiceName
    displayName: string
    route: string
    implemented: boolean
    resourceLabel: string
}> = [
    {name: 'cloudwatch', displayName: 'CloudWatch', route: '/cloudwatch', implemented: true, resourceLabel: 'log groups'},
    {name: 's3', displayName: 'S3', route: '/s3', implemented: true, resourceLabel: 'buckets'},
    {name: 'sqs', displayName: 'SQS', route: '/sqs', implemented: true, resourceLabel: 'queues'},
    {name: 'lambda', displayName: 'Lambda', route: '/lambda', implemented: true, resourceLabel: 'functions'},
    {name: 'dynamodb', displayName: 'DynamoDB', route: '/dynamodb', implemented: true, resourceLabel: 'tables'},
    {name: 'sns', displayName: 'SNS', route: '/sns', implemented: true, resourceLabel: 'topics'},
    {name: 'secretsmanager', displayName: 'Secrets Manager', route: '/secretsmanager', implemented: false, resourceLabel: 'secrets'},
    {name: 'cognito', displayName: 'Cognito', route: '/cognito', implemented: false, resourceLabel: 'user pools'},
    {name: 'rds', displayName: 'RDS', route: '/rds', implemented: false, resourceLabel: 'instances'},
    {name: 'elasticache', displayName: 'ElastiCache', route: '/elasticache', implemented: false, resourceLabel: 'clusters'},
    {name: 'iam', displayName: 'IAM', route: '/iam', implemented: false, resourceLabel: 'roles'},
    {name: 'ssm', displayName: 'Systems Manager', route: '/ssm', implemented: false, resourceLabel: 'parameters'},
    {name: 'kms', displayName: 'KMS', route: '/kms', implemented: false, resourceLabel: 'keys'},
]

// ─── Health ───────────────────────────────────────────────────────────────────

type FlociHealthResponse = {version?: string; services?: Record<string, string>}
type ServiceStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'

function normalizeStatus(value?: string): ServiceStatus {
    if (!value) return 'unknown'
    const n = value.toLowerCase()
    if (n === 'running' || n === 'healthy' || n === 'enabled') return 'healthy'
    if (n === 'available' || n === 'disabled') return 'unknown'
    if (n === 'degraded') return 'degraded'
    if (n === 'unavailable' || n === 'error' || n === 'down') return 'unavailable'
    return 'unknown'
}

function serviceHealth(raw: Record<string, string>, name: ServiceName): ServiceStatus {
    if (name === 'cloudwatch') {
        const logs = normalizeStatus(raw.logs ?? raw.cloudwatchlogs)
        const metrics = normalizeStatus(raw.monitoring ?? raw.cloudwatchmetrics)
        if (logs === 'healthy' || metrics === 'healthy') return 'healthy'
        if (logs === 'unavailable' || metrics === 'unavailable') return 'degraded'
        return 'unknown'
    }
    if (name === 'cognito') return normalizeStatus(raw['cognito-idp'] ?? raw.cognito)
    return normalizeStatus(raw[name])
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
    const health = await apiGet<FlociHealthResponse>('/health', 'health', signal)
    const raw = health.services ?? {}
    const services = SERVICE_META.map((meta) => ({
        name: meta.name,
        displayName: meta.displayName,
        status: serviceHealth(raw, meta.name),
        requestCount: 0,
        errorCount: 0,
    }))
    const implemented = services.filter((svc) => SERVICE_META.find((meta) => meta.name === svc.name)?.implemented)
    const status: ServiceStatus = implemented.some((svc) => svc.status === 'unavailable')
        ? 'degraded'
        : implemented.some((svc) => svc.status === 'healthy')
            ? 'healthy'
            : 'unknown'
    return {status, services, checkedAt: new Date().toISOString(), version: health.version}
}

async function timedCount(service: ServiceName, signal?: AbortSignal): Promise<ServiceResourceSnapshot> {
    const meta = SERVICE_META.find((item) => item.name === service)
    const displayName = meta?.displayName ?? service
    const started = performance.now()
    if (!meta?.implemented) return {service, displayName, implemented: false, status: 'unknown'}
    try {
        const resources = await listServiceResources(service, signal)
        return {service, displayName, implemented: true, status: 'healthy', count: resources.length, latencyMs: Math.round(performance.now() - started)}
    } catch (error) {
        return {service, displayName, implemented: true, status: 'unavailable', latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : 'Request failed'}
    }
}

export async function fetchConsoleOverview(signal?: AbortSignal): Promise<ConsoleOverview> {
    const [health, resources, logGroups, alarms, metrics] = await Promise.all([
        fetchHealth(signal),
        Promise.all(['s3', 'sqs', 'lambda', 'dynamodb', 'sns'].map((s) => timedCount(s as ServiceName, signal))),
        listLogGroups(undefined, signal).catch(() => []),
        listAlarms(signal).catch(() => []),
        listMetrics(signal).catch(() => []),
    ])
    return {
        checkedAt: new Date().toISOString(),
        health,
        resources,
        logGroupCount: logGroups.length,
        alarmCount: alarms.length,
        metricCount: metrics.length,
        totalResourceCount: resources.reduce((sum, svc) => sum + (svc.count ?? 0), 0),
    }
}

// ─── Generic resource list ────────────────────────────────────────────────────

export async function listServiceResources(service: ServiceName, signal?: AbortSignal): Promise<ResourceSummary[]> {
    if (service === 's3') return listS3Buckets(signal)
    if (service === 'sqs') return listSqsQueues(signal)
    if (service === 'sns') return listSnsTopics(signal)
    if (service === 'lambda') return listLambdaFunctions(signal)
    if (service === 'dynamodb') return listDynamoDbTables(signal)
    if (service === 'cloudwatch') return listCloudWatchResources(signal)
    return []
}

// ─── S3 ───────────────────────────────────────────────────────────────────────

async function listS3Buckets(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const buckets = await apiGet<Array<{name: string; createdAt?: string}>>('/s3/buckets', 's3', signal)
    return buckets.map(b => ({id: b.name, name: b.name, status: 'available', metadata: {createdAt: b.createdAt}}))
}

export interface S3Object {
    key: string
    size: number
    lastModified?: string
    etag?: string
}

export interface S3Contents {
    folders: string[]
    files: S3Object[]
}

export async function listS3Objects(bucket: string, prefix?: string, signal?: AbortSignal): Promise<S3Contents> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    return apiGet<S3Contents>(`/s3/${encodeURIComponent(bucket)}/objects${qs}`, 's3', signal)
}

export async function uploadS3Object(bucket: string, key: string, file: File | Blob, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${API_BASE}/s3/${encodeURIComponent(bucket)}/object?key=${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {'Content-Type': file.type || 'application/octet-stream'},
        body: file,
        signal,
    })
    if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
}

export function s3ObjectDownloadUrl(bucket: string, key: string): string {
    return `${API_BASE}/s3/${encodeURIComponent(bucket)}/object/download?key=${encodeURIComponent(key)}`
}

export async function deleteS3Object(bucket: string, key: string, signal?: AbortSignal): Promise<void> {
    await apiDelete(`/s3/${encodeURIComponent(bucket)}/object?key=${encodeURIComponent(key)}`, 's3', signal)
}

export async function deleteS3Objects(bucket: string, keys: string[], signal?: AbortSignal): Promise<void> {
    await apiPost(`/s3/${encodeURIComponent(bucket)}/objects/delete`, 's3', {keys}, signal)
}

export interface S3ObjectMetadata {
    contentType?: string
    contentLength?: number
    etag?: string
    lastModified?: string
    versionId?: string
    cacheControl?: string
    contentEncoding?: string
    contentDisposition?: string
}

export async function getS3ObjectMetadata(bucket: string, key: string, signal?: AbortSignal): Promise<S3ObjectMetadata> {
    return apiGet<S3ObjectMetadata>(`/s3/${encodeURIComponent(bucket)}/object/metadata?key=${encodeURIComponent(key)}`, 's3', signal)
}

export interface S3Tag { key: string; value: string }

export async function getS3ObjectTags(bucket: string, key: string, signal?: AbortSignal): Promise<S3Tag[]> {
    return apiGet<S3Tag[]>(`/s3/${encodeURIComponent(bucket)}/object/tags?key=${encodeURIComponent(key)}`, 's3', signal)
}

export async function putS3ObjectTags(bucket: string, key: string, tags: S3Tag[], signal?: AbortSignal): Promise<void> {
    await apiPut(`/s3/${encodeURIComponent(bucket)}/object/tags`, 's3', {key, tags}, signal)
}

export async function getBucketVersioning(bucket: string, signal?: AbortSignal): Promise<'Enabled' | 'Suspended' | 'Unversioned'> {
    const res = await apiGet<{status: string}>(`/s3/${encodeURIComponent(bucket)}/versioning`, 's3', signal)
    return res.status as 'Enabled' | 'Suspended' | 'Unversioned'
}

export async function putBucketVersioning(bucket: string, enabled: boolean, signal?: AbortSignal): Promise<void> {
    await apiPut(`/s3/${encodeURIComponent(bucket)}/versioning`, 's3', {enabled}, signal)
}

export async function getBucketTags(bucket: string, signal?: AbortSignal): Promise<S3Tag[]> {
    return apiGet<S3Tag[]>(`/s3/${encodeURIComponent(bucket)}/tags`, 's3', signal)
}

export async function putBucketTags(bucket: string, tags: S3Tag[], signal?: AbortSignal): Promise<void> {
    await apiPut(`/s3/${encodeURIComponent(bucket)}/tags`, 's3', {tags}, signal)
}

export async function createS3Bucket(name: string, signal?: AbortSignal): Promise<void> {
    await apiPost('/s3/buckets', 's3', {name}, signal)
}

export async function deleteS3Bucket(name: string, signal?: AbortSignal): Promise<void> {
    await apiDelete(`/s3/${encodeURIComponent(name)}`, 's3', signal)
}

export async function copyS3Object(srcBucket: string, srcKey: string, destBucket: string, destKey: string, signal?: AbortSignal): Promise<void> {
    await apiPost('/s3/copy', 's3', {srcBucket, srcKey, destBucket, destKey}, signal)
}

// ─── SQS ──────────────────────────────────────────────────────────────────────

async function listSqsQueues(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const queues = await apiGet<Array<{name: string; url: string}>>('/sqs/queues', 'sqs', signal)
    return queues.map(q => ({id: q.url, name: q.name, status: 'available', metadata: {queueUrl: q.url}}))
}

export interface SqsQueueAttributes {
    approximateNumberOfMessages?: number
    approximateNumberOfMessagesDelayed?: number
    approximateNumberOfMessagesNotVisible?: number
    createdTimestamp?: number
    lastModifiedTimestamp?: number
    visibilityTimeout?: number
    maximumMessageSize?: number
    messageRetentionPeriod?: number
    receiveMessageWaitTimeSeconds?: number
    delaySeconds?: number
    fifoQueue?: boolean
    contentBasedDeduplication?: boolean
}

export async function getSqsQueueAttributes(queueUrl: string, signal?: AbortSignal): Promise<SqsQueueAttributes> {
    return apiGet<SqsQueueAttributes>(`/sqs/queue/attributes?url=${encodeURIComponent(queueUrl)}`, 'sqs', signal)
}

export async function sendSqsMessage(queueUrl: string, messageBody: string, signal?: AbortSignal): Promise<string> {
    const res = await apiPost<{messageId: string}>('/sqs/queue/message', 'sqs', {url: queueUrl, messageBody}, signal)
    return res.messageId
}

export interface SqsMessage {
    messageId: string
    receiptHandle: string
    body: string
    sentTimestamp?: number
    receiveCount?: number
}

export async function peekSqsMessages(queueUrl: string, max = 10, signal?: AbortSignal): Promise<SqsMessage[]> {
    return apiGet<SqsMessage[]>(`/sqs/queue/messages?url=${encodeURIComponent(queueUrl)}&max=${max}`, 'sqs', signal)
}

// ─── SNS ──────────────────────────────────────────────────────────────────────

async function listSnsTopics(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const topics = await apiGet<Array<{name: string; arn: string}>>('/sns/topics', 'sns', signal)
    return topics.map(t => ({id: t.arn, name: t.name, status: 'available', metadata: {arn: t.arn}}))
}

// ─── Lambda ───────────────────────────────────────────────────────────────────

async function listLambdaFunctions(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const fns = await apiGet<Array<{
        name: string; arn?: string; runtime?: string; handler?: string
        state?: string; lastModified?: string; memorySize?: number
        timeout?: number; codeSize?: number; packageType?: string; description?: string
    }>>('/lambda/functions', 'lambda', signal)
    return fns.map(fn => ({
        id: fn.arn ?? fn.name,
        name: fn.name,
        status: fn.state ?? 'Active',
        description: fn.description ?? fn.handler,
        metadata: {runtime: fn.runtime, handler: fn.handler, memoryMb: fn.memorySize, timeoutSec: fn.timeout, codeSize: fn.codeSize, packageType: fn.packageType, lastModified: fn.lastModified},
    }))
}

// ─── DynamoDB ─────────────────────────────────────────────────────────────────

async function listDynamoDbTables(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const tables = await apiGet<Array<{
        name: string; arn?: string; status?: string
        itemCount?: number; sizeBytes?: number; billingMode?: string; createdAt?: string
    }>>('/dynamodb/tables', 'dynamodb', signal)
    return tables.map(t => ({
        id: t.arn ?? t.name,
        name: t.name,
        status: t.status ?? 'unknown',
        metadata: {itemCount: t.itemCount, sizeBytes: t.sizeBytes, billingMode: t.billingMode, createdAt: t.createdAt},
    }))
}

export type DynamoDbItem = Record<string, unknown>

export async function scanDynamoDbTable(tableName: string, limit = 50, signal?: AbortSignal): Promise<{items: DynamoDbItem[]; count: number; scannedCount: number}> {
    return apiGet(`/dynamodb/${encodeURIComponent(tableName)}/items?limit=${limit}`, 'dynamodb', signal)
}

// ─── CloudWatch ───────────────────────────────────────────────────────────────

async function listCloudWatchResources(signal?: AbortSignal): Promise<ResourceSummary[]> {
    const [groups, alarms, metrics] = await Promise.all([
        listLogGroups(undefined, signal).catch(() => []),
        listAlarms(signal).catch(() => []),
        listMetrics(signal).catch(() => []),
    ])
    return [
        ...groups.map(g => ({id: `log-group:${g.name}`, name: g.name, status: 'log group', metadata: {storedBytes: g.storedBytes, createdAt: g.createdAt}})),
        ...alarms.map(a => ({id: `alarm:${a.alarmName}`, name: a.alarmName, status: a.stateValue, metadata: {metricName: a.metricName, namespace: a.namespace, threshold: a.threshold}})),
        ...metrics.map(m => ({id: `metric:${m.id}`, name: `${m.namespace}/${m.metricName}`, status: 'metric', metadata: {dimensions: m.dimensions.length}})),
    ]
}

export async function listLogGroups(prefix?: string, signal?: AbortSignal): Promise<CWLogGroup[]> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    return apiGet<CWLogGroup[]>(`/cloudwatch/log-groups${qs}`, 'cloudwatch', signal)
}

export async function listLogStreams(logGroupName: string, signal?: AbortSignal): Promise<CWLogStream[]> {
    if (!logGroupName) return []
    return apiGet<CWLogStream[]>(`/cloudwatch/log-streams?group=${encodeURIComponent(logGroupName)}`, 'cloudwatch', signal)
}

export async function getLogEvents(logGroupName: string, logStreamName: string, signal?: AbortSignal): Promise<CWLogEvent[]> {
    if (!logGroupName || !logStreamName) return []
    return apiGet<CWLogEvent[]>(`/cloudwatch/log-events?group=${encodeURIComponent(logGroupName)}&stream=${encodeURIComponent(logStreamName)}`, 'cloudwatch', signal)
}

export async function listAlarms(signal?: AbortSignal): Promise<CWAlarm[]> {
    return apiGet<CWAlarm[]>('/cloudwatch/alarms', 'cloudwatch', signal)
}

export async function listMetrics(signal?: AbortSignal): Promise<CWMetric[]> {
    return apiGet<CWMetric[]>('/cloudwatch/metrics', 'cloudwatch', signal)
}

export async function createLogGroup(logGroupName: string, retentionInDays?: number): Promise<void> {
    await apiPost('/cloudwatch/log-groups', 'cloudwatch', {name: logGroupName, retentionInDays})
}

export async function createLogStream(logGroupName: string, logStreamName: string): Promise<void> {
    await apiPost('/cloudwatch/log-streams', 'cloudwatch', {group: logGroupName, name: logStreamName})
}

export async function putLogEvents(logGroupName: string, logStreamName: string, logEvents: Array<{timestamp: number; message: string}>): Promise<void> {
    await apiPost('/cloudwatch/log-events', 'cloudwatch', {group: logGroupName, stream: logStreamName, events: logEvents})
}
