# 环境变量清单

> 所有 service 都设了 `RAILWAY_DOCKERFILE_PATH=apps/<name>/Dockerfile`（关键：让 Railway 用对的 Dockerfile，root dir = `/`，build 上下文是仓库根）。下面省略这一项。
>
> 凭据真值（client_id / client_secret / 各种 password）在仓库根的 `auth0.md`（gitignored），需要时去那里查。

## bluedux (web)

| 变量 | 值（示例） | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` | `bluedux.us.auth0.com` | Auth0 tenant |
| `AUTH0_CLIENT_ID` | `<bluedux web app 的 client id>` | Regular Web Application |
| `AUTH0_CLIENT_SECRET` | `<...>` | 同上 |
| `AUTH0_AUDIENCE` | `https://api.bluedux.com` | API identifier |
| `APP_BASE_URL` | `https://bluedux.com` | Auth0 SDK v4 用作 redirect_uri base |
| `AUTH0_SECRET` | `<openssl rand -hex 32>` | session cookie 加密 |
| `BLUEDUX_API_URL` | `http://bluedux-api.railway.internal:8080` | 走内网 |
| `PORT` | `8080` | Next.js standalone 监听端口 |

## bluedux-api

| 变量 | 值（示例） | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` | `bluedux.us.auth0.com` | JWKS 校验 |
| `AUTH0_AUDIENCE` | `https://api.bluedux.com` | 主 audience；middleware 实际接受**两个** audience（见下） |
| `DATABASE_URL` | `postgresql://postgres:<pwd>@postgres.railway.internal:5432/bluedux` | 注意是 `bluedux` database，不是 `railway` |
| `SFTPGO_BASE_URL` | `https://sftpgo-production-a929.up.railway.app` | 暂用公网 |
| `SFTPGO_ADMIN_USERNAME` | `admin` | MVP 暂用，**生产前换** |
| `SFTPGO_ADMIN_PASSWORD` | `noneed` | 同上 |
| `SFTPGO_USER_PASSWORD_KEY` | `<openssl rand -hex 32>` | HMAC key 派生每个用户的 sftpgo 密码 |
| `SFTPGO_WEBHOOK_TOKEN` | `<openssl rand -hex 24>` | sftpgo → api webhook 共享密钥 |
| `BLUEDUX_ADMIN_PASSWORD` | `<openssl rand -hex 16>` | admin endpoint 校验 X-Admin-Token |
| `PORT` | `8080` |  |

**双 audience 接受**：`apps/api/src/middleware/auth.ts` 里 `audiences = [env.AUTH0_AUDIENCE, 'https://mcp.bluedux.com/mcp']`，jose `jwtVerify` 接受数组（任一匹配即通过）。原因：MCP server 把用户 JWT 原封不动转发给 api，api 必须能验那个 JWT。Web/admin 各自的 token 不受影响。

## bluedux-mcp

| 变量 | 值 | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` | `bluedux.us.auth0.com` |  |
| `AUTH0_AUDIENCE` | `https://mcp.bluedux.com/mcp` | **不是** `api.bluedux.com`——MCP 自己有独立 audience，bluedux.api 兼容两个 |
| `BLUEDUX_API_URL` | `http://bluedux-api.railway.internal:8080` | 走内网 |
| `PORT` | `8080` |  |

## bluedux-admin

| 变量 | 值 | 说明 |
|---|---|---|
| `BLUEDUX_API_URL` | `http://bluedux-api.railway.internal:8080` | SSR 拉数据用 |
| `BLUEDUX_ADMIN_PASSWORD` | 同 api 那个 | middleware Basic Auth + 透传 X-Admin-Token |
| `PORT` | `3001` |  |

## sftpgo

镜像构建：`deploy/sftpgo-railway/Dockerfile`（基于 `drakkan/sftpgo:alpine`，`USER 0:0`，启动时 `chmod 0777 /srv/sftpgo/data`）。Railway 用 `deploy/sftpgo-railway/railway.json` 指定 builder。

关键 env vars：
- `SFTPGO_DATA_PROVIDER__*` 系列：连 Postgres `railway` database
- `SFTPGO_DATA_PROVIDER__USERS_BASE_DIR=/srv/sftpgo/data`、`BACKUPS_PATH=/srv/sftpgo/data/backups`
- `SFTPGO_HTTPD__BINDINGS__0__CLIENT_IP_PROXY_HEADER=X-Forwarded-For`、`PROXY_ALLOWED=0.0.0.0/0,::/0`、`PROXY_MODE=0`、`SFTPGO_HTTPD__TOKEN_VALIDATION=1`（关掉 JWT 跟 IP 绑定，否则 Railway 反代换 IP 后所有 token 失效）
- 默认 admin：`SFTPGO_DEFAULT_ADMIN_USERNAME=admin` / `SFTPGO_DEFAULT_ADMIN_PASSWORD=noneed`（MVP，**生产前换**）
- **不再有** OIDC env vars（migration 时全部删了，现在所有用户认证由 bluedux web/mcp 走 Auth0 完成，sftpgo 只看用户名密码 + SSH key）

Event Manager rule（sftpgo → bluedux.api fs event webhook）：通过 `deploy/sftpgo-railway/events-webhook.json` 一次性 `POST /api/v2/loaddata?mode=0` 导入到 Postgres，规则永久生效。文件 gitignored（含 webhook secret），现场重建时按 `apps/api/src/routes/webhooks.ts` 期望的 payload shape 配。
