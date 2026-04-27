import { env } from './env'

export class BlueduxApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`bluedux.api ${status}: ${body}`)
  }
}

export class BlueduxApi {
  constructor(private readonly userToken: string) {}

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${env.BLUEDUX_API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.userToken}`,
      },
    })
    if (!res.ok) throw new BlueduxApiError(res.status, await res.text())
    return res
  }

  async ensureProvisioned(): Promise<void> {
    const me = (await (await this.req('/v1/me')).json()) as { provisioned: boolean }
    if (!me.provisioned) {
      await this.req('/v1/me/provision', { method: 'POST' })
    }
  }

  async listFiles(path: string): Promise<{ path: string; entries: unknown[] }> {
    const res = await this.req(`/v1/files?path=${encodeURIComponent(path)}`)
    return (await res.json()) as { path: string; entries: unknown[] }
  }

  async readFile(path: string): Promise<{ contentBase64: string; size: number }> {
    const res = await this.req(`/v1/files/download?path=${encodeURIComponent(path)}`)
    const buf = await res.arrayBuffer()
    return {
      contentBase64: Buffer.from(buf).toString('base64'),
      size: buf.byteLength,
    }
  }

  async writeFile(path: string, contentBase64: string): Promise<{ size: number }> {
    const buf = Buffer.from(contentBase64, 'base64')
    const res = await this.req(`/v1/files/upload?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf,
    })
    return (await res.json()) as { size: number }
  }

  async deleteFile(path: string): Promise<void> {
    await this.req(`/v1/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  }
}
