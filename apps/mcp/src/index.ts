import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { env } from './env'
import { verifyBearer, AuthError } from './auth'
import { BlueduxApi } from './api-client'
import { createMcpServer } from './server'

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/') {
    return writeJson(res, 200, { name: 'bluedux.mcp', version: '0.0.0' })
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return writeJson(res, 200, { ok: true })
  }

  if (url.pathname !== '/mcp') {
    return writeJson(res, 404, { error: 'not found' })
  }

  let user
  try {
    user = await verifyBearer(req.headers['authorization'])
  } catch (err) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="bluedux.mcp", error="invalid_token"')
    return writeJson(res, 401, { error: err instanceof AuthError ? err.message : 'invalid token' })
  }

  const api = new BlueduxApi(user.rawToken)
  try {
    await api.ensureProvisioned()
  } catch (err) {
    return writeJson(res, 502, { error: 'provision failed', detail: String(err) })
  }

  const incomingBody = req.method === 'POST' ? await readJson(req).catch(() => undefined) : undefined

  const server = createMcpServer(api)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0])
  await server.connect(transport as never)

  await transport.handleRequest(req, res, incomingBody)
})

const port = env.PORT
httpServer.listen(port, () => {
  console.log(`bluedux.mcp listening on :${port}`)
})
