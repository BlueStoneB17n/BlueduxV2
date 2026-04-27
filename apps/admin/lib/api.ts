const apiBase = process.env['BLUEDUX_API_URL'] ?? 'http://localhost:8080'
const adminToken = process.env['BLUEDUX_ADMIN_PASSWORD']

export async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { 'X-Admin-Token': adminToken ?? '' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`api ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

export interface AuditRow {
  id: number
  ts: string
  action: string
  path: string | null
  size: number | null
  source: string
  userId: number | null
  userEmail: string | null
  userSftpgoUsername: string | null
}

export interface UserRow {
  id: number
  email: string
  name: string | null
  sftpgoUsername: string | null
  sshPubkey: string | null
  storageQuotaBytes: number | null
  createdAt: string
}

export interface AuditResponse {
  audit: AuditRow[]
  totalsByAction: Array<{ action: string; count: number }>
  users: UserRow[]
  fetchedAt: string
}

export function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
