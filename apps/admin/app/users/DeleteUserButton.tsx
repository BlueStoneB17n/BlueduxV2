'use client'

import { useState, useTransition } from 'react'
import { deleteUserAction } from './actions'

export function DeleteUserButton({ id, email }: { id: number; email: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    if (!confirm(`Delete user ${email} (id ${id})?\nThis removes the sftpgo account, all audit log entries, and the db row.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteUserAction(id)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <span>
      <button type="button" onClick={onClick} disabled={pending} style={{ color: 'var(--danger)' }}>
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 4 }}>{error}</div>}
    </span>
  )
}
