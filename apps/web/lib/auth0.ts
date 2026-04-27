import { Auth0Client } from '@auth0/nextjs-auth0/server'

const audience = process.env['AUTH0_AUDIENCE']

export const auth0 = new Auth0Client({
  authorizationParameters: {
    ...(audience !== undefined ? { audience } : {}),
    scope: 'openid profile email read:files write:files delete:files manage:keys',
  },
})
