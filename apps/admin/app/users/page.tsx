import { adminFetch, formatBytes, type AuditResponse } from '../../lib/api'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  let data: AuditResponse | null = null
  let error: string | null = null
  try {
    data = await adminFetch<AuditResponse>('/v1/admin/audit?limit=1')
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="container">
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <span className="spacer" />
        {data && <span className="muted">fetched {new Date(data.fetchedAt).toLocaleString()}</span>}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <strong style={{ color: 'var(--danger)' }}>Error:</strong> {error}
        </div>
      )}

      {data && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>SFTPGo</th>
                <th>SSH key</th>
                <th>Quota</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.length === 0 && (
                <tr><td colSpan={7} className="muted">(no users)</td></tr>
              )}
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="muted">{u.id}</td>
                  <td>{u.email}</td>
                  <td>{u.name ?? '—'}</td>
                  <td><code>{u.sftpgoUsername ?? '—'}</code></td>
                  <td>{u.sshPubkey ? '✓' : '—'}</td>
                  <td>{formatBytes(u.storageQuotaBytes)}</td>
                  <td className="muted">{new Date(u.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
