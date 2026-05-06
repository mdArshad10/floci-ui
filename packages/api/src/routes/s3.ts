import {Hono} from 'hono'
import {
    CopyObjectCommand,
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetBucketTaggingCommand,
    GetBucketVersioningCommand,
    GetObjectCommand,
    GetObjectTaggingCommand,
    HeadObjectCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    PutBucketTaggingCommand,
    PutBucketVersioningCommand,
    PutObjectCommand,
    PutObjectTaggingCommand,
} from '@aws-sdk/client-s3'
import {s3} from '../aws'

const app = new Hono()

app.get('/buckets', async (c) => {
    const res = await s3.send(new ListBucketsCommand({}))
    return c.json((res.Buckets ?? []).map(b => ({
        name: b.Name ?? '',
        createdAt: b.CreationDate?.toISOString(),
    })))
})

app.post('/buckets', async (c) => {
    const {name} = await c.req.json<{name: string}>()
    await s3.send(new CreateBucketCommand({Bucket: name}))
    return c.json({ok: true})
})

app.delete('/:bucket', async (c) => {
    await s3.send(new DeleteBucketCommand({Bucket: c.req.param('bucket')}))
    return c.json({ok: true})
})

app.get('/:bucket/objects', async (c) => {
    const bucket = c.req.param('bucket')
    const prefix = c.req.query('prefix')
    const res = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        Delimiter: '/',
    }))
    return c.json({
        folders: (res.CommonPrefixes ?? []).map(p => p.Prefix ?? ''),
        files: (res.Contents ?? []).map(o => ({
            key: o.Key ?? '',
            size: o.Size ?? 0,
            lastModified: o.LastModified?.toISOString(),
            etag: o.ETag?.replace(/"/g, ''),
        })),
    })
})

app.put('/:bucket/object', async (c) => {
    const bucket = c.req.param('bucket')
    const key = c.req.query('key') ?? ''
    const contentType = c.req.header('content-type') || 'application/octet-stream'
    const body = await c.req.arrayBuffer()
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: new Uint8Array(body),
        ContentType: contentType,
    }))
    return c.json({ok: true})
})

app.delete('/:bucket/object', async (c) => {
    const bucket = c.req.param('bucket')
    const key = c.req.query('key') ?? ''
    await s3.send(new DeleteObjectCommand({Bucket: bucket, Key: key}))
    return c.json({ok: true})
})

app.post('/:bucket/objects/delete', async (c) => {
    const bucket = c.req.param('bucket')
    const {keys} = await c.req.json<{keys: string[]}>()
    await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {Objects: keys.map(k => ({Key: k})), Quiet: true},
    }))
    return c.json({ok: true})
})

app.get('/:bucket/object/download', async (c) => {
    const bucket = c.req.param('bucket')
    const key = c.req.query('key') ?? ''
    const res = await s3.send(new GetObjectCommand({Bucket: bucket, Key: key}))
    const headers: Record<string, string> = {}
    if (res.ContentType) headers['content-type'] = res.ContentType
    if (res.ContentLength) headers['content-length'] = String(res.ContentLength)
    if (res.ETag) headers['etag'] = res.ETag
    const filename = key.split('/').pop() ?? key
    headers['content-disposition'] = `attachment; filename="${filename}"`
    return new Response(res.Body as ReadableStream, {headers})
})

app.get('/:bucket/object/metadata', async (c) => {
    const bucket = c.req.param('bucket')
    const key = c.req.query('key') ?? ''
    const res = await s3.send(new HeadObjectCommand({Bucket: bucket, Key: key}))
    return c.json({
        contentType: res.ContentType,
        contentLength: res.ContentLength,
        etag: res.ETag?.replace(/"/g, ''),
        lastModified: res.LastModified?.toISOString(),
        versionId: res.VersionId,
        cacheControl: res.CacheControl,
        contentEncoding: res.ContentEncoding,
        contentDisposition: res.ContentDisposition,
    })
})

app.get('/:bucket/object/tags', async (c) => {
    const bucket = c.req.param('bucket')
    const key = c.req.query('key') ?? ''
    const res = await s3.send(new GetObjectTaggingCommand({Bucket: bucket, Key: key}))
    return c.json((res.TagSet ?? []).map(t => ({key: t.Key ?? '', value: t.Value ?? ''})))
})

app.put('/:bucket/object/tags', async (c) => {
    const bucket = c.req.param('bucket')
    const {key, tags} = await c.req.json<{key: string; tags: Array<{key: string; value: string}>}>()
    await s3.send(new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: {TagSet: tags.map(t => ({Key: t.key, Value: t.value}))},
    }))
    return c.json({ok: true})
})

app.get('/:bucket/versioning', async (c) => {
    const res = await s3.send(new GetBucketVersioningCommand({Bucket: c.req.param('bucket')}))
    const status = res.Status === 'Enabled' ? 'Enabled' : res.Status === 'Suspended' ? 'Suspended' : 'Unversioned'
    return c.json({status})
})

app.put('/:bucket/versioning', async (c) => {
    const bucket = c.req.param('bucket')
    const {enabled} = await c.req.json<{enabled: boolean}>()
    await s3.send(new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: {Status: enabled ? 'Enabled' : 'Suspended'},
    }))
    return c.json({ok: true})
})

app.get('/:bucket/tags', async (c) => {
    try {
        const res = await s3.send(new GetBucketTaggingCommand({Bucket: c.req.param('bucket')}))
        return c.json((res.TagSet ?? []).map(t => ({key: t.Key ?? '', value: t.Value ?? ''})))
    } catch {
        return c.json([])
    }
})

app.put('/:bucket/tags', async (c) => {
    const bucket = c.req.param('bucket')
    const {tags} = await c.req.json<{tags: Array<{key: string; value: string}>}>()
    await s3.send(new PutBucketTaggingCommand({
        Bucket: bucket,
        Tagging: {TagSet: tags.map(t => ({Key: t.key, Value: t.value}))},
    }))
    return c.json({ok: true})
})

app.post('/copy', async (c) => {
    const {srcBucket, srcKey, destBucket, destKey} = await c.req.json<{
        srcBucket: string; srcKey: string; destBucket: string; destKey: string
    }>()
    await s3.send(new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `/${srcBucket}/${srcKey}`,
    }))
    return c.json({ok: true})
})

export default app
