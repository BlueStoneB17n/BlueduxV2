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

function publicBase(req: IncomingMessage): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost'
  return `${proto}://${host}`
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version')
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id')
  res.setHeader('Access-Control-Max-Age', '86400')
}

const httpServer = createServer(async (req, res) => {
  const reqId = Math.random().toString(36).slice(2, 8)
  const authHdr = req.headers['authorization']
  const authPreview = typeof authHdr === 'string' ? `${authHdr.slice(0, 14)}…(len=${authHdr.length})` : 'none'
  console.log(`[${reqId}] ${req.method} ${req.url} origin=${req.headers.origin ?? '-'} ct=${req.headers['content-type'] ?? '-'} auth=${authPreview}`)

  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    console.log(`[${reqId}] -> 204 (CORS preflight)`)
    return res.end()
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/') {
    console.log(`[${reqId}] -> 200 root`)
    return writeJson(res, 200, { name: 'bluedux.mcp', version: '0.0.0' })
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return writeJson(res, 200, { ok: true })
  }
  if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource/mcp') {
    console.log(`[${reqId}] -> 200 PRM`)
    return writeJson(res, 200, {
      resource: `${publicBase(req)}/mcp`,
      authorization_servers: [`https://${env.AUTH0_DOMAIN}`],
      scopes_supported: ['openid', 'profile', 'email', 'read:files', 'write:files', 'delete:files'],
      bearer_methods_supported: ['header'],
    })
  }

  if (url.pathname !== '/mcp') {
    console.log(`[${reqId}] -> 404 (path=${url.pathname})`)
    return writeJson(res, 404, { error: 'not found' })
  }

  let user
  try {
    user = await verifyBearer(req.headers['authorization'])
    console.log(`[${reqId}] auth ok sub=${user.sub} scopes=[${user.scopes.join(',')}]`)
  } catch (err) {
    const metadataUrl = `${publicBase(req)}/.well-known/oauth-protected-resource/mcp`
    res.setHeader(
      'WWW-Authenticate',
      `Bearer realm="bluedux.mcp", error="invalid_token", resource_metadata="${metadataUrl}"`,
    )
    console.log(`[${reqId}] -> 401 auth fail: ${err instanceof Error ? err.message : String(err)}`)
    return writeJson(res, 401, { error: err instanceof AuthError ? err.message : 'invalid token' })
  }

  const api = new BlueduxApi(user.rawToken)
  try {
    await api.ensureProvisioned()
    console.log(`[${reqId}] provision ok`)
  } catch (err) {
    console.log(`[${reqId}] -> 502 provision fail: ${String(err)}`)
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
