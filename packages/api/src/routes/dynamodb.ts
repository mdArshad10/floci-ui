import {Hono} from 'hono'
import {DescribeTableCommand, ListTablesCommand, ScanCommand} from '@aws-sdk/client-dynamodb'
import {dynamodb} from '../aws'

const app = new Hono()

app.get('/tables', async (c) => {
    const res = await dynamodb.send(new ListTablesCommand({}))
    const names = res.TableNames ?? []
    const tables = await Promise.all(names.map(async (name) => {
        try {
            const detail = await dynamodb.send(new DescribeTableCommand({TableName: name}))
            const t = detail.Table
            return {
                name: t?.TableName ?? name,
                arn: t?.TableArn,
                status: t?.TableStatus ?? 'unknown',
                itemCount: t?.ItemCount,
                sizeBytes: t?.TableSizeBytes,
                billingMode: t?.BillingModeSummary?.BillingMode,
                createdAt: t?.CreationDateTime?.toISOString(),
            }
        } catch {
            return {name, status: 'unknown'}
        }
    }))
    return c.json(tables)
})

app.get('/:table/items', async (c) => {
    const table = c.req.param('table')
    const limit = Number(c.req.query('limit') ?? '50')
    const res = await dynamodb.send(new ScanCommand({TableName: table, Limit: limit}))

    const items = (res.Items ?? []).map(raw => {
        const plain: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(raw)) {
            if (v.S !== undefined) plain[k] = v.S
            else if (v.N !== undefined) plain[k] = Number(v.N)
            else if (v.BOOL !== undefined) plain[k] = v.BOOL
            else if (v.NULL) plain[k] = null
            else plain[k] = v
        }
        return plain
    })

    return c.json({items, count: res.Count ?? items.length, scannedCount: res.ScannedCount ?? items.length})
})

export default app
