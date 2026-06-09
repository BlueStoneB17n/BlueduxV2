import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { users } from '@bluedux/db'
import { SftpgoError } from '@bluedux/sftpgo-client'
import { requireAuth, type AuthUser } from '../middleware/auth'
import { db } from '../lib/db'
import { sftpgo } from '../lib/sftpgo'
import { deriveSftpgoPassword } from '../lib/sftpgo-password'
import { env } from '../env'

const filesRoutes = new Hono<{ Variables: { user: AuthUser } }>()

filesRoutes.use('*', requireAuth)

async function getUserContext(authSub: string) {
  const row = await db.query.users.findFirst({ where: eq(users.auth0Sub, authSub) })
  if (!row?.sftpgoUsername) return null
  const password = deriveSftpgoPassword(env.SFTPGO_USER_PASSWORD_KEY, authSub)
  const { token } = await sftpgo.userLogin(row.sftpgoUsername, password)
  return { row, sftpgoUsername: row.sftpgoUsername, userToken: token }
}

filesRoutes.get('/', async (c) => {
  const u = c.get('user')
  const ctx = await getUserContext(u.sub)
  if (!ctx) return c.json({ error: 'not provisioned' }, 409)

  const path = c.req.query('path') ?? '/'
  try {
    const entries = await sftpgo.listFiles(ctx.userToken, path)
    return c.json({ path, entries })
  } catch (err) {
    if (err instanceof SftpgoError && err.status === 404) {
      return c.json({ path, entries: [] }) // 目录尚未创建 → 列为空
    }
    throw err // 真正的错误(5xx 等)照旧抛出
  }
})

filesRoutes.get('/download', async (c) => {
  const u = c.get('user')
  const ctx = await getUserContext(u.sub)
  if (!ctx) return c.json({ error: 'not provisioned' }, 409)

  const path = c.req.query('path')
  if (!path) return c.json({ error: 'path required' }, 400)

  const upstream = await sftpgo.readFile(ctx.userToken, path)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-length': upstream.headers.get('content-length') ?? '',
      'content-disposition': `attachment; filename="${encodeURIComponent(path.split('/').pop() ?? 'file')}"`,
    },
  })
})

filesRoutes.post('/upload', async (c) => {
  const u = c.get('user')
  const ctx = await getUserContext(u.sub)
  if (!ctx) return c.json({ error: 'not provisioned' }, 409)

  const path = c.req.query('path')
  if (!path) return c.json({ error: 'path required' }, 400)

  const body = await c.req.arrayBuffer()
  await sftpgo.writeFile(ctx.userToken, path, body, { mkdirParents: true })
  return c.json({ ok: true, path, size: body.byteLength })
})

filesRoutes.delete('/', async (c) => {
  const u = c.get('user')
  const ctx = await getUserContext(u.sub)
  if (!ctx) return c.json({ error: 'not provisioned' }, 409)

  const path = c.req.query('path')
  if (!path) return c.json({ error: 'path required' }, 400)

  await sftpgo.deleteFileOrDir(ctx.userToken, path)
  return c.json({ ok: true })
})

export { filesRoutes }
