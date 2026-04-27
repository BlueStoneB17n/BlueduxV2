import { z } from 'zod'

const userSchema = z.object({
  username: z.string(),
  status: z.number(),
  email: z.string().optional().default(''),
  home_dir: z.string(),
  permissions: z.record(z.array(z.string())),
  quota_size: z.number(),
  public_keys: z.array(z.string()).optional().default([]),
  description: z.string().optional().default(''),
})

export type SftpgoUser = z.infer<typeof userSchema>

export interface SftpgoClientOptions {
  baseUrl: string
  adminUsername: string
  adminPassword: string
}

export class SftpgoClient {
  private adminTokenCache: { token: string; exp: number } | null = null

  constructor(private readonly opts: SftpgoClientOptions) {}

  private async adminToken(): Promise<string> {
    const now = Date.now() / 1000
    if (this.adminTokenCache && this.adminTokenCache.exp > now + 30) {
      return this.adminTokenCache.token
    }
    const auth = btoa(`${this.opts.adminUsername}:${this.opts.adminPassword}`)
    const res = await fetch(`${this.opts.baseUrl}/api/v2/token`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) throw new SftpgoError(res.status, `admin login failed: ${await res.text()}`)
    const body = (await res.json()) as { access_token: string; expires_at: string }
    const exp = Math.floor(new Date(body.expires_at).getTime() / 1000)
    this.adminTokenCache = { token: body.access_token, exp }
    return body.access_token
  }

  private async adminFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.adminToken()
    return fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    })
  }

  async userLogin(username: string, password: string): Promise<{ token: string; expiresAt: Date }> {
    const auth = btoa(`${username}:${password}`)
    const res = await fetch(`${this.opts.baseUrl}/api/v2/user/token`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) throw new SftpgoError(res.status, `user login failed: ${await res.text()}`)
    const body = (await res.json()) as { access_token: string; expires_at: string }
    return { token: body.access_token, expiresAt: new Date(body.expires_at) }
  }

  async getUser(username: string): Promise<SftpgoUser | null> {
    const res = await this.adminFetch(`/api/v2/users/${encodeURIComponent(username)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
    return userSchema.parse(await res.json())
  }

  async createUser(input: {
    username: string
    password?: string
    email?: string
    homeDir: string
    quotaSize: number
    publicKeys?: string[]
    description?: string
  }): Promise<SftpgoUser> {
    const body = {
      username: input.username,
      ...(input.password !== undefined ? { password: input.password } : {}),
      status: 1,
      email: input.email ?? '',
      home_dir: input.homeDir,
      permissions: { '/': ['*'] },
      quota_size: input.quotaSize,
      public_keys: input.publicKeys ?? [],
      description: input.description ?? '',
    }
    const res = await this.adminFetch('/api/v2/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
    return userSchema.parse(await res.json())
  }

  async updateUser(
    username: string,
    patch: { password?: string; publicKeys?: string[]; quotaSize?: number },
  ): Promise<void> {
    const current = await this.getUser(username)
    if (!current) throw new SftpgoError(404, `user not found: ${username}`)
    const body = {
      ...current,
      ...(patch.password !== undefined ? { password: patch.password } : {}),
      ...(patch.publicKeys !== undefined ? { public_keys: patch.publicKeys } : {}),
      ...(patch.quotaSize !== undefined ? { quota_size: patch.quotaSize } : {}),
    }
    const res = await this.adminFetch(`/api/v2/users/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
  }

  async deleteUser(username: string): Promise<void> {
    const res = await this.adminFetch(`/api/v2/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 404) throw new SftpgoError(res.status, await res.text())
  }

  /**
   * Wipe everything under the user's home dir using the user's own token.
   * Best-effort — caller handles errors. Does NOT delete the user record itself.
   * Uses /api/v2/user/dirs DELETE which internally calls RemoveAll (recursive)
   * — works for both files and directories.
   */
  async purgeUserFiles(username: string, password: string): Promise<void> {
    const { token } = await this.userLogin(username, password)
    const entries = await this.listFiles(token, '/')
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue
      const target = `/${e.name}`
      const res = await fetch(
        `${this.opts.baseUrl}/api/v2/user/dirs?path=${encodeURIComponent(target)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok && res.status !== 404) throw new SftpgoError(res.status, await res.text())
    }
  }

  async listFiles(userToken: string, path: string): Promise<DirEntry[]> {
    const res = await fetch(
      `${this.opts.baseUrl}/api/v2/user/dirs?path=${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    )
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
    return (await res.json()) as DirEntry[]
  }

  async readFile(userToken: string, path: string): Promise<Response> {
    const res = await fetch(
      `${this.opts.baseUrl}/api/v2/user/files?path=${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    )
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
    return res
  }

  async writeFile(
    userToken: string,
    path: string,
    body: BodyInit,
    opts: { mkdirParents?: boolean } = {},
  ): Promise<void> {
    const url = new URL(`${this.opts.baseUrl}/api/v2/user/files/upload`)
    url.searchParams.set('path', path)
    if (opts.mkdirParents) url.searchParams.set('mkdir_parents', 'true')
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body,
    })
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
  }

  async deleteFileOrDir(userToken: string, path: string): Promise<void> {
    const res = await fetch(
      `${this.opts.baseUrl}/api/v2/user/files?path=${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` },
      },
    )
    if (!res.ok) throw new SftpgoError(res.status, await res.text())
  }
}

export interface DirEntry {
  name: string
  size: number
  mode: number
  last_modified: string
}

export class SftpgoError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SftpgoError'
  }
}
