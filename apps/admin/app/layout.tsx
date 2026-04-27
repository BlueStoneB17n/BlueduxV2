import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bluedux admin',
  description: 'Bluedux backoffice',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="brand">Bluedux admin</span>
          <Link href="/audit">Audit</Link>
          <Link href="/users">Users</Link>
          <span className="spacer" />
          <span className="muted">basic-auth</span>
        </nav>
        {children}
      </body>
    </html>
  )
}
