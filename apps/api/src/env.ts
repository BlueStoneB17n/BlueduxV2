import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),
  SFTPGO_BASE_URL: z.string().url(),
  SFTPGO_ADMIN_USERNAME: z.string().min(1),
  SFTPGO_ADMIN_PASSWORD: z.string().min(1),
  SFTPGO_USER_PASSWORD_KEY: z.string().min(32),
  SFTPGO_WEBHOOK_TOKEN: z.string().min(16),
  BLUEDUX_ADMIN_PASSWORD: z.string().min(16),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
