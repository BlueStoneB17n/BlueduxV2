'use client'

import { useState } from 'react'

export function SshKeyForm({ currentKey }: { currentKey: string }) {
  const [value, setValue] = useState(currentKey)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/proxy/sshkey', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: value.trim() }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`save failed: ${res.status} ${txt}`)
      }
      setMsg({ kind: 'ok', text: 'Key saved. Try connecting now.' })
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <textarea
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ssh-ed25519 AAAA... user@host"
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={saving || !value.trim()}>
          {saving ? 'Saving…' : 'Save key'}
        </button>
        {msg && (
          <span style={{ color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>{msg.text}</span>
        )}
      </div>
    </form>
  )
}
