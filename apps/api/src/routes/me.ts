import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@bluedux/db'
import { requireAuth, fetchUserInfo, type AuthUser } from '../middleware/auth'
import { db } from '../lib/db'
import { sftpgo } from '../lib/sftpgo'
import { deriveSftpgoPassword } from '../lib/sftpgo-password'
import { env } from '../env'

const SFTPGO_DATA_ROOT = '/srv/sftpgo/data'
const DEFAULT_QUOTA = 314_572_800

const meRoutes = new Hono<{ Variables: { user: AuthUser } }>()

meRoutes.use('*', requireAuth)

meRoutes.get('/', async (c) => {
  const u = c.get('user')
  const row = await db.query.users.findFirst({ where: eq(users.auth0Sub, u.sub) })
  return c.json({ provisioned: !!row, user: row ?? null })
})

meRoutes.post('/provision', async (c) => {
  const u = c.get('user')
  const existing = await db.query.users.findFirst({ where: eq(users.auth0Sub, u.sub) })
  if (existing && existing.sftpgoUsername) {
    return c.json({ ok: true, alreadyProvisioned: true, user: existing })
  }

  let email = u.email
  let name = u.name
  if (!email) {
    const profile = await fetchUserInfo(u.rawToken)
    email = profile.email
    name = profile.name
  }
  if (!email) {
    return c.json({ error: 'no email available (token claims missing and userinfo failed)' }, 502)
  }

  const username = email
  const homeDir = `${SFTPGO_DATA_ROOT}/${username}`
  const password = deriveSftpgoPassword(env.SFTPGO_USER_PASSWORD_KEY, u.sub)

  const sftpgoUser = await sftpgo.getUser(username)
  if (!sftpgoUser) {
    await sftpgo.createUser({
      username,
      password,
      email,
      homeDir,
      quotaSize: DEFAULT_QUOTA,
      description: 'Auto-provisioned via bluedux.api',
    })
  } else {
    await sftpgo.updateUser(username, { password })
  }

  const dbRow = existing
    ? await db
        .update(users)
        .set({
          email,
          name: name ?? existing.name,
          sftpgoUsername: username,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning()
    : await db
        .insert(users)
        .values({
          auth0Sub: u.sub,
          email,
          name: name ?? null,
          sftpgoUsername: username,
          storageQuotaBytes: DEFAULT_QUOTA,
        })
        .returning()

  return c.json({ ok: true, alreadyProvisioned: false, user: dbRow[0] })
})

const sshKeyBody = z.object({
  publicKey: z.string().min(1),
})

meRoutes.put('/sshkey', async (c) => {
  const u = c.get('user')
  const parsed = sshKeyBody.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400)

  const row = await db.query.users.findFirst({ where: eq(users.auth0Sub, u.sub) })
  if (!row?.sftpgoUsername) return c.json({ error: 'not provisioned' }, 409)

  await sftpgo.updateUser(row.sftpgoUsername, { publicKeys: [parsed.data.publicKey] })
  await db
    .update(users)
    .set({ sshPubkey: parsed.data.publicKey, updatedAt: new Date() })
    .where(eq(users.id, row.id))

  return c.json({ ok: true })
})

export { meRoutes }
