import { redirect } from 'next/navigation'
import { auth0 } from '../lib/auth0'

export default async function HomePage() {
  const session = await auth0.getSession()
  if (session) redirect('/files')

  return (
    <div className="container">
      <h1>Bluedux</h1>
      <p className="muted">Secure file management with SFTP and web access.</p>
      <a className="btn" href="/auth/login">Sign in with Google</a>
    </div>
  )
}
