import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { MiddlewareHandler } from 'hono'
import { env } from '../env'

const issuer = `https://${env.AUTH0_DOMAIN}/`
const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`))

const audiences: string[] = [env.AUTH0_AUDIENCE, 'https://mcp.bluedux.com/mcp']

export interface AuthUser {
  sub: string
  scopes: string[]
  rawToken: string
}

export const requireAuth: MiddlewareHandler<{ Variables: { user: AuthUser } }> = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'missing bearer token' }, 401)
  }
  const token = header.slice(7)
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: audiences,
    })
    if (typeof payload.sub !== 'string') {
      return c.json({ error: 'invalid token: missing sub' }, 401)
    }
    const scopeStr = typeof payload['scope'] === 'string' ? payload['scope'] : ''
    c.set('user', {
      sub: payload.sub,
      scopes: scopeStr.split(' ').filter(Boolean),
      rawToken: token,
    })
    await next()
  } catch (err) {
    return c.json({ error: 'invalid token', detail: String(err) }, 401)
  }
}

export interface UserInfo {
  sub: string
  email: string
  name?: string
  email_verified?: boolean
}

let cachedUserInfo = new Map<string, { info: UserInfo; exp: number }>()

export async function fetchUserInfo(rawToken: string): Promise<UserInfo> {
  const cached = cachedUserInfo.get(rawToken)
  if (cached && cached.exp > Date.now()) return cached.info

  const res = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${rawToken}` },
  })
  if (!res.ok) {
    throw new Error(`userinfo fetch failed: ${res.status} ${await res.text()}`)
  }
  const info = (await res.json()) as UserInfo
  cachedUserInfo.set(rawToken, { info, exp: Date.now() + 60_000 })
  return info
}
