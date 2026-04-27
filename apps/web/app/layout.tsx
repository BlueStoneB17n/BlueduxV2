import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Auth0Provider } from '@auth0/nextjs-auth0'
import { auth0 } from '../lib/auth0'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bluedux',
  description: 'Secure file management',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession()
  return (
    <html lang="en">
      <body>
        <Auth0Provider {...(session?.user ? { user: session.user } : {})}>{children}</Auth0Provider>
      </body>
    </html>
  )
}
