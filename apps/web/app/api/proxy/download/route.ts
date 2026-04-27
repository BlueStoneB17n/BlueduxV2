import { NextResponse, type NextRequest } from 'next/server'
import { auth0 } from '../../../../lib/auth0'

const apiBaseUrl = process.env['BLUEDUX_API_URL'] ?? 'http://localhost:8080'

export async function GET(request: NextRequest) {
  const session = await auth0.getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const path = new URL(request.url).searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const { token } = await auth0.getAccessToken()
  const upstream = await fetch(`${apiBaseUrl}/v1/files/download?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-length': upstream.headers.get('content-length') ?? '',
      'content-disposition': upstream.headers.get('content-disposition') ?? `attachment; filename="${encodeURIComponent(path.split('/').pop() ?? 'file')}"`,
    },
  })
}
