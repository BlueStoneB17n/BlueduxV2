import { auth0 } from './auth0'

const apiBaseUrl = process.env['BLUEDUX_API_URL'] ?? 'http://localhost:8080'

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`api error ${status}: ${body}`)
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { token } = await auth0.getAccessToken()
  if (!token) throw new Error('no access token in session')
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })
  return res
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await authedFetch(path)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return (await res.json()) as T
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: 'POST' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await authedFetch(path, init)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return (await res.json()) as T
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return (await res.json()) as T
}

export async function apiDelete(path: string): Promise<void> {
  const res = await authedFetch(path, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, await res.text())
}

export async function apiUploadFile(path: string, file: File): Promise<{ ok: true; size: number }> {
  const url = `/v1/files/upload?path=${encodeURIComponent(path)}`
  const res = await authedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return (await res.json()) as { ok: true; size: number }
}
