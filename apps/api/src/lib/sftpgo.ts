import { SftpgoClient } from '@bluedux/sftpgo-client'
import { env } from '../env'

export const sftpgo = new SftpgoClient({
  baseUrl: env.SFTPGO_BASE_URL,
  adminUsername: env.SFTPGO_ADMIN_USERNAME,
  adminPassword: env.SFTPGO_ADMIN_PASSWORD,
})
