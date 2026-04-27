'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface DirEntry {
  name: string
  size: number
  mode: number
  last_modified: string
}

const isDir = (mode: number) => (mode & 0o040000) !== 0

export function FilesPanel({
  initialPath,
  initialEntries,
}: {
  initialPath: string
  initialEntries: DirEntry[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigate = (p: string) => {
    startTransition(() => {
      router.push(`/files?path=${encodeURIComponent(p)}`)
    })
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const target = (initialPath.endsWith('/') ? initialPath : initialPath + '/') + file.name
      const res = await fetch(`/api/proxy/upload?path=${encodeURIComponent(target)}`, {
        method: 'POST',
        body: file,
      })
      if (!res.ok) throw new Error(`upload failed: ${res.status}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const onDelete = async (entry: DirEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return
    setError(null)
    try {
      const target = (initialPath.endsWith('/') ? initialPath : initialPath + '/') + entry.name
      const res = await fetch(`/api/proxy/delete?path=${encodeURIComponent(target)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete error')
    }
  }

  const parent = initialPath === '/' ? null : initialPath.replace(/\/$/, '').replace(/\/[^/]+$/, '') || '/'

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 16 }}>
        <label className="btn" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? 'Uploading…' : 'Upload file'}
          <input type="file" onChange={onUpload} disabled={uploading} style={{ display: 'none' }} />
        </label>
        {parent !== null && (
          <button className="btn outline" onClick={() => navigate(parent)} disabled={pending}>
            ↑ Parent
          </button>
        )}
        <span className="spacer" />
        {pending && <span className="muted">Loading…</span>}
      </div>

      {error && (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Modified</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {initialEntries.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">(empty)</td>
            </tr>
          )}
          {initialEntries.map((entry) => {
            const dir = isDir(entry.mode)
            const childPath = (initialPath.endsWith('/') ? initialPath : initialPath + '/') + entry.name
            return (
              <tr key={entry.name}>
                <td>
                  {dir ? (
                    <button
                      className="btn outline"
                      onClick={() => navigate(childPath)}
                      style={{ padding: '4px 8px' }}
                    >
                      📁 {entry.name}
                    </button>
                  ) : (
                    <a href={`/api/proxy/download?path=${encodeURIComponent(childPath)}`}>
                      📄 {entry.name}
                    </a>
                  )}
                </td>
                <td>{dir ? '—' : `${entry.size} B`}</td>
                <td className="muted">{new Date(entry.last_modified).toLocaleString()}</td>
                <td>
                  <button className="btn danger" onClick={() => onDelete(entry)} style={{ padding: '4px 10px' }}>
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
