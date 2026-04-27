import { createHmac } from 'node:crypto'

export function deriveSftpgoPassword(key: string, auth0Sub: string): string {
  return createHmac('sha256', key).update(auth0Sub).digest('base64url')
}
