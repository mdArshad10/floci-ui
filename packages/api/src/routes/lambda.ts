import {Hono} from 'hono'
import {ListFunctionsCommand} from '@aws-sdk/client-lambda'
import {lambda} from '../aws'

const app = new Hono()

app.get('/functions', async (c) => {
    const res = await lambda.send(new ListFunctionsCommand({}))
    return c.json((res.Functions ?? []).map(fn => ({
        name: fn.FunctionName ?? '',
        arn: fn.FunctionArn,
        runtime: fn.Runtime,
        handler: fn.Handler,
        state: fn.State,
        lastModified: fn.LastModified,
        memorySize: fn.MemorySize,
        timeout: fn.Timeout,
        codeSize: fn.CodeSize,
        packageType: fn.PackageType,
        description: fn.Description,
    })))
})

export default app
