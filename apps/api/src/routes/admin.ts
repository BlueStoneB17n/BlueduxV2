import { Hono } from 'hono'
import { desc, eq, sql } from 'drizzle-orm'
import { auditLog, users } from '@bluedux/db'
import { db } from '../lib/db'
import { sftpgo } from '../lib/sftpgo'
import { deriveSftpgoPassword } from '../lib/sftpgo-password'
import { env } from '../env'

const adminRoutes = new Hono()

adminRoutes.use('*', async (c, next) => {
  const token = c.req.header('X-Admin-Token')
  if (!token || token !== env.BLUEDUX_ADMIN_PASSWORD) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})

adminRoutes.get('/audit', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 200), 1000)

  const rows = await db
    .select({
      id: auditLog.id,
      ts: auditLog.ts,
      action: auditLog.action,
      path: auditLog.path,
      size: auditLog.size,
      source: auditLog.source,
      userId: auditLog.userId,
      userEmail: users.email,
      userSftpgoUsername: users.sftpgoUsername,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.ts))
    .limit(limit)

  const totalsByAction = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)::int` })
    .from(auditLog)
    .groupBy(auditLog.action)

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      sftpgoUsername: users.sftpgoUsername,
      sshPubkey: users.sshPubkey,
      storageQuotaBytes: users.storageQuotaBytes,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))

  return c.json({
    audit: rows,
    totalsByAction,
    users: userRows,
    fetchedAt: new Date().toISOString(),
  })
})

adminRoutes.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'invalid id' }, 400)
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!user) return c.json({ error: 'not found' }, 404)

  const result: {
    sftpgo: 'deleted' | 'absent' | 'failed'
    sftpgoError?: string
    filesPurged?: boolean
    filesPurgeError?: string
  } = { sftpgo: 'absent' }
  if (user.sftpgoUsername) {
    try {
      const password = deriveSftpgoPassword(env.SFTPGO_USER_PASSWORD_KEY, user.auth0Sub)
      await sftpgo.purgeUserFiles(user.sftpgoUsername, password)
      result.filesPurged = true
    } catch (err) {
      result.filesPurged = false
      result.filesPurgeError = err instanceof Error ? err.message : String(err)
    }
    try {
      await sftpgo.deleteUser(user.sftpgoUsername)
      result.sftpgo = 'deleted'
    } catch (err) {
      result.sftpgo = 'failed'
      result.sftpgoError = err instanceof Error ? err.message : String(err)
    }
  }

  await db.delete(auditLog).where(eq(auditLog.userId, id))
  await db.delete(users).where(eq(users.id, id))

  return c.json({ ok: true, ...result })
})

export { adminRoutes }
