import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export * from './schema'

export type Database = ReturnType<typeof createClient>

export function createClient(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  return drizzle(pool, { schema })
}
