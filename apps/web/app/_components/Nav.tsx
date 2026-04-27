import Link from 'next/link'

export function Nav({ userEmail }: { userEmail: string }) {
  return (
    <nav className="nav">
      <span className="brand">Bluedux</span>
      <Link href="/files">Files</Link>
      <Link href="/settings/ssh-key">SSH key</Link>
      <span className="spacer" />
      <span className="muted">{userEmail}</span>
      <a href="/auth/logout">Logout</a>
    </nav>
  )
}
