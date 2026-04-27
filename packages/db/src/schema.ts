import {
  pgTable,
  bigserial,
  varchar,
  text,
  bigint,
  timestamp,
  serial,
  integer,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  auth0Sub: varchar('auth0_sub', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  sftpgoUsername: varchar('sftpgo_username', { length: 320 }).unique(),
  sshPubkey: text('ssh_pubkey'),
  storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }).default(314572800),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: varchar('action', { length: 32 }).notNull(),
  path: text('path'),
  size: bigint('size', { mode: 'number' }),
  source: varchar('source', { length: 16 }).notNull(),
  ts: timestamp('ts').defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert
