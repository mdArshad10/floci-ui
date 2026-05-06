import {Hono} from 'hono'
import {ListTopicsCommand} from '@aws-sdk/client-sns'
import {sns} from '../aws'

const app = new Hono()

app.get('/topics', async (c) => {
    const res = await sns.send(new ListTopicsCommand({}))
    return c.json((res.Topics ?? []).map(t => {
        const arn = t.TopicArn ?? ''
        const name = arn.split(':').pop() ?? arn
        return {name, arn}
    }))
})

export default app
