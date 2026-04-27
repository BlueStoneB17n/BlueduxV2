import { NextResponse, type NextRequest } from 'next/server'
import { auth0 } from '../../../../lib/auth0'

const apiBaseUrl = process.env['BLUEDUX_API_URL'] ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const session = await auth0.getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const path = new URL(request.url).searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const { token } = await auth0.getAccessToken()
  const res = await fetch(`${apiBaseUrl}/v1/files/upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': request.headers.get('content-type') ?? 'application/octet-stream',
    },
    body: request.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
