import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from './env'

const issuer = `https://${env.AUTH0_DOMAIN}/`
const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`))

export interface VerifiedUser {
  sub: string
  scopes: string[]
  rawToken: string
}

export async function verifyBearer(authHeader: string | undefined): Promise<VerifiedUser> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('missing bearer token')
  }
  const token = authHeader.slice(7)
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: env.AUTH0_AUDIENCE,
  })
  if (typeof payload.sub !== 'string') {
    throw new AuthError('invalid token: missing sub')
  }
  const scopeStr = typeof payload['scope'] === 'string' ? payload['scope'] : ''
  return {
    sub: payload.sub,
    scopes: scopeStr.split(' ').filter(Boolean),
    rawToken: token,
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}
