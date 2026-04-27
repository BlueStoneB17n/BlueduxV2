import { redirect } from 'next/navigation'
import { auth0 } from '../../../lib/auth0'
import { apiGet, apiPost } from '../../../lib/api-client'
import { Nav } from '../../_components/Nav'
import { SshKeyForm } from './SshKeyForm'

interface MeResponse {
  provisioned: boolean
  user: { id: number; email: string; sftpgoUsername: string | null; sshPubkey: string | null } | null
}

export default async function SshKeyPage() {
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login')

  let me = await apiGet<MeResponse>('/v1/me')
  if (!me.provisioned) {
    await apiPost<{ ok: true }>('/v1/me/provision')
    me = await apiGet<MeResponse>('/v1/me')
  }

  return (
    <>
      <Nav userEmail={session.user.email ?? '?'} />
      <div className="container">
        <h1>SSH key</h1>
        <p className="muted">
          Paste your SSH <strong>public</strong> key here. The matching private key is what your
          SFTP client will use to connect to <code>sftpgo-production-a929.up.railway.app:2022</code>{' '}
          as user <code>{me.user?.sftpgoUsername ?? '?'}</code>.
        </p>
        <div className="card">
          <SshKeyForm currentKey={me.user?.sshPubkey ?? ''} />
        </div>
      </div>
    </>
  )
}
