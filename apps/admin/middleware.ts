import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const adminPw = process.env['BLUEDUX_ADMIN_PASSWORD']
  if (!adminPw) {
    return new NextResponse('admin not configured', { status: 503 })
  }

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Basic ')) {
    return unauthorized()
  }

  let decoded: string
  try {
    decoded = atob(auth.slice(6))
  } catch {
    return unauthorized()
  }
  const sep = decoded.indexOf(':')
  if (sep < 0) return unauthorized()
  const pass = decoded.slice(sep + 1)
  if (pass !== adminPw) return unauthorized()

  return NextResponse.next()
}

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="bluedux admin"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
