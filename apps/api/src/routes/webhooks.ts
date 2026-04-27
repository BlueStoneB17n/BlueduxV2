import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users, auditLog } from '@bluedux/db'
import { db } from '../lib/db'
import { env } from '../env'

const webhooksRoutes = new Hono()

const sftpgoEvent = z.object({
  action: z.string(),
  username: z.string(),
  path: z.string().optional().default(''),
  file_size: z.coerce.number().optional().default(0),
  protocol: z.string().optional().default(''),
})

webhooksRoutes.post('/sftpgo', async (c) => {
  const tokenHeader = c.req.header('X-SFTPGO-Webhook-Token')
  if (tokenHeader !== env.SFTPGO_WEBHOOK_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const parsed = sftpgoEvent.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'bad payload', issues: parsed.error.issues }, 400)
  const ev = parsed.data

  const userRow = await db.query.users.findFirst({ where: eq(users.sftpgoUsername, ev.username) })

  await db.insert(auditLog).values({
    userId: userRow?.id ?? null,
    action: ev.action,
    path: ev.path,
    size: ev.file_size,
    source: ev.protocol || 'sftp',
  })

  return c.json({ ok: true })
})

export { webhooksRoutes }
