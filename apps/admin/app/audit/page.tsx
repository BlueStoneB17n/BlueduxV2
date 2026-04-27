import { adminFetch, formatBytes, type AuditResponse } from '../../lib/api'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  let data: AuditResponse | null = null
  let error: string | null = null
  try {
    data = await adminFetch<AuditResponse>('/v1/admin/audit?limit=500')
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="container">
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Audit log</h1>
        <span className="spacer" />
        {data && <span className="muted">fetched {new Date(data.fetchedAt).toLocaleString()}</span>}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <strong style={{ color: 'var(--danger)' }}>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Totals by action</h2>
            {data.totalsByAction.length === 0 ? (
              <p className="muted">(no events yet)</p>
            ) : (
              <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
                {data.totalsByAction.map((t) => (
                  <div key={t.action}>
                    <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                      {t.action}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{t.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Recent events ({data.audit.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Path</th>
                  <th>Size</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.length === 0 && (
                  <tr><td colSpan={6} className="muted">(no events yet)</td></tr>
                )}
                {data.audit.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{new Date(row.ts).toLocaleString()}</td>
                    <td><strong>{row.action}</strong></td>
                    <td>{row.userEmail ?? <span className="muted">(unknown sftpgo: {row.userSftpgoUsername ?? '?'})</span>}</td>
                    <td><code>{row.path ?? '—'}</code></td>
                    <td>{formatBytes(row.size)}</td>
                    <td className="muted">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
