import {Hono} from 'hono'

const app = new Hono()

const FLOCI_ENDPOINT = process.env.FLOCI_ENDPOINT || 'http://localhost:4566'

app.get('/', async (c) => {
    try {
        const res = await fetch(`${FLOCI_ENDPOINT}/_floci/health`)
        if (!res.ok) return c.json({status: 'unavailable'}, 502)
        const data = await res.json()
        return c.json(data)
    } catch (err) {
        return c.json({status: 'unavailable', error: String(err)}, 502)
    }
})

export default app
