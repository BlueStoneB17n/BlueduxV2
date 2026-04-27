import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './env'
import { meRoutes } from './routes/me'
import { filesRoutes } from './routes/files'
import { webhooksRoutes } from './routes/webhooks'
import { adminRoutes } from './routes/admin'

const app = new Hono()

app.use('*', logger())
app.use(
  '/v1/*',
  cors({
    origin: ['https://bluedux.com', 'https://www.bluedux.com', 'http://localhost:3000'],
    credentials: true,
  }),
)

app.get('/', (c) => c.json({ name: 'bluedux.api', version: '0.0.0' }))
app.get('/healthz', (c) => c.json({ ok: true }))

app.route('/v1/me', meRoutes)
app.route('/v1/files', filesRoutes)
app.route('/v1/webhooks', webhooksRoutes)
app.route('/v1/admin', adminRoutes)

const port = env.PORT
console.log(`bluedux.api listening on :${port}`)
serve({ fetch: app.fetch, port })
