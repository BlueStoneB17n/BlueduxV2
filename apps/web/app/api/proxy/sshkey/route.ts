import { NextResponse, type NextRequest } from 'next/server'
import { auth0 } from '../../../../lib/auth0'

const apiBaseUrl = process.env['BLUEDUX_API_URL'] ?? 'http://localhost:8080'

export async function PUT(request: NextRequest) {
  const session = await auth0.getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token } = await auth0.getAccessToken()
  const body = await request.text()
  const res = await fetch(`${apiBaseUrl}/v1/me/sshkey`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
