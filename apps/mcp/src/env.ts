import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),
  BLUEDUX_API_URL: z.string().url(),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
