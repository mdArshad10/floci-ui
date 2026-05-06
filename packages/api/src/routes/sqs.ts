import {Hono} from 'hono'
import {
    GetQueueAttributesCommand,
    ListQueuesCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
} from '@aws-sdk/client-sqs'
import {sqs} from '../aws'

const app = new Hono()

function epochMs(v?: string): number | undefined {
    if (!v) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : undefined
}

app.get('/queues', async (c) => {
    const res = await sqs.send(new ListQueuesCommand({}))
    return c.json((res.QueueUrls ?? []).map(url => {
        const name = url.split('/').filter(Boolean).pop() ?? url
        return {name, url}
    }))
})

app.get('/queue/attributes', async (c) => {
    const url = c.req.query('url') ?? ''
    const res = await sqs.send(new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: ['All'],
    }))
    const a = res.Attributes ?? {}
    const toInt = (k: string) => a[k] !== undefined ? Number(a[k]) : undefined
    return c.json({
        approximateNumberOfMessages: toInt('ApproximateNumberOfMessages'),
        approximateNumberOfMessagesDelayed: toInt('ApproximateNumberOfMessagesDelayed'),
        approximateNumberOfMessagesNotVisible: toInt('ApproximateNumberOfMessagesNotVisible'),
        createdTimestamp: epochMs(a['CreatedTimestamp']),
        lastModifiedTimestamp: epochMs(a['LastModifiedTimestamp']),
        visibilityTimeout: toInt('VisibilityTimeout'),
        maximumMessageSize: toInt('MaximumMessageSize'),
        messageRetentionPeriod: toInt('MessageRetentionPeriod'),
        receiveMessageWaitTimeSeconds: toInt('ReceiveMessageWaitTimeSeconds'),
        delaySeconds: toInt('DelaySeconds'),
        fifoQueue: a['FifoQueue'] === 'true',
        contentBasedDeduplication: a['ContentBasedDeduplication'] === 'true',
    })
})

app.post('/queue/message', async (c) => {
    const {url, messageBody} = await c.req.json<{url: string; messageBody: string}>()
    const res = await sqs.send(new SendMessageCommand({QueueUrl: url, MessageBody: messageBody}))
    return c.json({messageId: res.MessageId ?? ''})
})

app.get('/queue/messages', async (c) => {
    const url = c.req.query('url') ?? ''
    const max = Math.min(Number(c.req.query('max') ?? '10'), 10)
    const res = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: max,
        VisibilityTimeout: 0,
        AttributeNames: ['All'],
    }))
    return c.json((res.Messages ?? []).map(msg => ({
        messageId: msg.MessageId ?? '',
        receiptHandle: msg.ReceiptHandle ?? '',
        body: msg.Body ?? '',
        sentTimestamp: epochMs(msg.Attributes?.['SentTimestamp']),
        receiveCount: Number(msg.Attributes?.['ApproximateReceiveCount'] ?? 0) || undefined,
    })))
})

export default app
