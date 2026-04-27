import { redirect } from 'next/navigation'
import { auth0 } from '../../lib/auth0'
import { apiGet, apiPost, ApiError } from '../../lib/api-client'
import { Nav } from '../_components/Nav'
import { FilesPanel } from './FilesPanel'

interface DirEntry {
  name: string
  size: number
  mode: number
  last_modified: string
}

interface FilesResponse {
  path: string
  entries: DirEntry[]
}

interface MeResponse {
  provisioned: boolean
  user: { id: number; email: string; sftpgoUsername: string | null } | null
}

async function ensureProvisioned(): Promise<MeResponse> {
  const me = await apiGet<MeResponse>('/v1/me')
  if (me.provisioned) return me
  await apiPost<{ ok: true }>('/v1/me/provision')
  return await apiGet<MeResponse>('/v1/me')
}

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>
}) {
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login')

  const me = await ensureProvisioned()
  const sp = await searchParams
  const path = sp.path ?? '/'

  let listing: FilesResponse
  try {
    listing = await apiGet<FilesResponse>(`/v1/files?path=${encodeURIComponent(path)}`)
  } catch (e) {
    if (e instanceof ApiError) listing = { path, entries: [] }
    else throw e
  }

  return (
    <>
      <Nav userEmail={session.user.email ?? '?'} />
      <div className="container">
        <h1>Files</h1>
        <p className="muted">
          home: <code>{me.user?.sftpgoUsername ?? '(provisioning...)'}</code> · current: <code>{path}</code>
        </p>
        <FilesPanel initialPath={path} initialEntries={listing.entries} />
      </div>
    </>
  )
}
