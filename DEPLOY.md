# BlueduxV2 部署文档

## 整体架构

```
User browser ───────► bluedux.com (Next.js apps/web)
                       │
                       │ Auth0 (Google IdP)
                       ▼
                      Auth0 tenant: bluedux.us.auth0.com
                       │
User browser ─Bearer──► bluedux-api (Hono)
SFTP client ──SSH key─► sftpgo  ────webhook────► bluedux-api ──► bluedux DB (audit_log)
MCP client ─OAuth+PKCE► bluedux-mcp ─Bearer──► bluedux-api
                       │
                       └─admin token──► sftpgo (provision users / files)
```

## Railway 项目结构（project: `bluedux`）

| Service | URL（公网）| 内网 DNS | 作用 |
|---|---|---|---|
| **bluedux** | `https://bluedux.com` / `https://www.bluedux.com` (Cloudflare 橙云 + Railway 边缘) | `bluedux.railway.internal:8080` | Next.js 15 SSR，用户 UI（Auth0 登录、文件浏览/上传/下载、SSH key 管理） |
| **bluedux-api** | `https://bluedux-api-production.up.railway.app` | `bluedux-api.railway.internal:8080` | Hono on Node，业务 API + JWKS 校验 + sftpgo admin 调用 + sftpgo webhook 接收 |
| **bluedux-mcp** | `https://bluedux-mcp-production.up.railway.app` | `bluedux-mcp.railway.internal:8080` | MCP server（@modelcontextprotocol/sdk），给 AI agent OAuth Authorization Code+PKCE |
| **sftpgo** | `https://sftpgo-production-a929.up.railway.app` (admin only) + `tcp 2022` (SFTP) | `sftpgo.railway.internal` | 文件存储 + SFTP 协议；用户 webclient 已不直接暴露 |
| **Postgres** | 不公开 | `postgres.railway.internal:5432` | 内置两个 database：`railway`（sftpgo 用）+ `bluedux`（bluedux-api 用） |

## 环境变量清单

### bluedux (web)

| 变量 | 值（示例） | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` | `bluedux.us.auth0.com` | Auth0 tenant |
| `AUTH0_CLIENT_ID` | `<bluedux web app 的 client id>` | Regular Web Application |
| `AUTH0_CLIENT_SECRET` | `<...>` | 同上 |
| `AUTH0_AUDIENCE` | `https://api.bluedux.com` | API identifier |
| `APP_BASE_URL` | `https://bluedux.com` | Auth0 SDK v4 用作 redirect_uri base |
| `AUTH0_SECRET` | `<openssl rand -hex 32>` | session cookie 加密 |
| `BLUEDUX_API_URL` | `http://bluedux-api.railway.internal:8080` | 走内网 |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` | 关键：让 Railway 用对的 Dockerfile（root dir = `/`） |
| `PORT` | `8080` | nginx/Next.js standalone 监听端口 |

### bluedux-api

| 变量 | 值（示例） | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` | 同 web | JWKS 校验入口 + audience |
| `DATABASE_URL` | `postgresql://postgres:<pwd>@postgres.railway.internal:5432/bluedux` | 注意是 `bluedux` database |
| `SFTPGO_BASE_URL` | `https://sftpgo-production-a929.up.railway.app` | 暂用公网，将来可改 internal |
| `SFTPGO_ADMIN_USERNAME` | `admin` | MVP 暂用，**生产前换** |
| `SFTPGO_ADMIN_PASSWORD` | `noneed` | 同上 |
| `SFTPGO_USER_PASSWORD_KEY` | `<openssl rand -hex 32>` | HMAC key 派生每个用户的 sftpgo 密码 |
| `SFTPGO_WEBHOOK_TOKEN` | `<openssl rand -hex 24>` | sftpgo → api 的 webhook 共享密钥 |
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` |  |
| `PORT` | `8080` |  |

### bluedux-mcp

| 变量 | 值 | 说明 |
|---|---|---|
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` | 同 api | 校验用户 Bearer |
| `BLUEDUX_API_URL` | `http://bluedux-api.railway.internal:8080` | 走内网 |
| `RAILWAY_DOCKERFILE_PATH` | `apps/mcp/Dockerfile` |  |
| `PORT` | `8080` |  |

### sftpgo
（变化：删了 OIDC 8 个变量，其余保持。详见 `deploy/sftpgo-railway/DEPLOY.md`）

## 仓库结构（pnpm monorepo）

```
BlueduxV2/
├── apps/
│   ├── web/                Next.js 15 App Router (Auth0 SDK v4)
│   ├── api/                Hono on Node + Drizzle + jose JWKS
│   └── mcp/                @modelcontextprotocol/sdk on Node
├── packages/
│   ├── db/                 Drizzle schema + migrations + client factory
│   └── sftpgo-client/      sftpgo HTTP API 类型化 client（admin token + user token + file ops）
├── deploy/
│   └── sftpgo-railway/     sftpgo Dockerfile + railway.json + 历史 DEPLOY.md
├── pnpm-workspace.yaml
├── package.json (root)
├── tsconfig.base.json
├── DEPLOY.md (本文件)
└── auth0.md  (gitignored — Auth0 凭据小抄)
```

## Auth0 配置摘要

| Auth0 资源 | 类型 | 说明 |
|---|---|---|
| Application `bluedux web` | Regular Web Application | Callback: `/auth/callback` × 3 host (localhost/bluedux.com/www.bluedux.com)。Auth0 SDK v4 自动 mount routes |
| Application `bluedux mcp` | Native | Callback: `http://localhost`（OAuth Loopback Redirect, Auth0 接受任意端口）+ `https://mcp.bluedux.com/auth/callback` |
| API `bluedux api` | Custom API | Identifier (audience) `https://api.bluedux.com`。5 scopes: `read:files write:files delete:files manage:keys read:profile` |
| Connection `google-oauth2` | Social | 复用 GCP OAuth client，回调指向 `https://bluedux.us.auth0.com/login/callback` |

## 用户流程

### Web 登录
1. 用户访问 `bluedux.com` → 看登录按钮 → 点 → `/auth/login`
2. SDK 重定向到 `https://bluedux.us.auth0.com/authorize?...&client_id=...&audience=https://api.bluedux.com&scope=openid profile email read:files ...&code_challenge=...`（PKCE）
3. Auth0 → Google → 用户授权 → 回 Auth0 → 回 `/auth/callback` 带 `code`
4. SDK 用 `code` + `code_verifier` 换 access_token + id_token，写 session cookie
5. 重定向到 `/files`
6. `/files` page 是 server component，读 session，对 bluedux.api 请求 `/v1/me/provision`（首次登录）→ bluedux DB 写 user 行 + sftpgo admin 调 `POST /api/v2/users` 建 sftpgo 用户（password = HMAC(`SFTPGO_USER_PASSWORD_KEY`, `auth0_sub`)，home_dir = `/srv/sftpgo/data/<email>`，quota=300MB）
7. 之后所有 `/files` 操作走 `/api/proxy/*` → bluedux.api（带 Bearer）→ sftpgo

### SFTP 客户端登录
1. 用户在 `/settings/ssh-key` 贴 SSH 公钥 → bluedux.api `PUT /v1/me/sshkey` → 写 bluedux DB + 调 sftpgo 更新 `public_keys`
2. 客户端 `sftp -P 2022 <email>@sftpgo-production-a929.up.railway.app`，用对应私钥 → sftpgo 校验 pubkey → 登录成功
3. 上传/下载文件触发 sftpgo Event Manager `bluedux-fs-events` → `POST http://bluedux-api.railway.internal:8080/v1/webhooks/sftpgo`（含 `X-SFTPGO-Webhook-Token`）→ bluedux DB `audit_log` 行

### MCP 客户端登录
1. AI agent（Claude Desktop 等）配置 MCP server URL: `https://mcp.bluedux.com/mcp`
2. MCP client 走 OAuth Authorization Code + PKCE，浏览器跳 Auth0 (`bluedux mcp` Native app)
3. 拿到用户 access_token，每次 MCP 请求带 `Authorization: Bearer <token>`
4. bluedux-mcp JWKS 验证 → 调 bluedux.api（同样 Bearer）→ sftpgo

## 部署技巧/坑

1. **`RAILWAY_DOCKERFILE_PATH` 而不是 `railway.json`** —— 单 monorepo 多 service 时，每个 service 不同 Dockerfile path，dashboard 也行但 env var 最方便。
2. **`pnpm deploy --prod` 输出 self-contained 目录** —— 用于 runtime 镜像 stage，避免 lockfile 不匹配 + workspace symlink 失效。
3. **tsup `noExternal: [/^@bluedux\//]`** —— 把 workspace 包内联进 bundle，否则 runtime 会尝试 import `.ts` 源码报错（Node 22 不支持 node_modules 里 strip TS types）。
4. **Auth0 SDK v4 路由是 `/auth/login`** —— 不是 v3 的 `/api/auth/login`。Callback URL 要配在 Auth0 dashboard 的 Allowed Callback URLs。
5. **sftpgo username = email** —— home_dir 含 `@`、`.` Linux 合法，sftpgo 默认 `naming_rules` 允许。
6. **sftpgo password 派生** —— 不存库、不下发，每次需要时 `HMAC-SHA256(SFTPGO_USER_PASSWORD_KEY, auth0_sub)` 派生。SSO 密码在 user 视角不存在；用户实际登录全靠 Auth0 + SSH key。
7. **Railway internal DNS** —— `<service>.railway.internal` 只在同 project 同 environment 内可达，免出网费 + 更快。
8. **GCP OAuth client redirect URI** —— 加 Auth0 的 `https://bluedux.us.auth0.com/login/callback` 才能让 Auth0 用同一个 GCP OAuth 走 Google 登录；JavaScript origins 不需要。

## 验证清单

- [ ] `https://bluedux.com` 显示 Welcome + Sign in with Google 按钮
- [ ] 点击登录 → 跳 Auth0 → Google 授权 → 跳回 `/files` 空列表
- [ ] `/settings/ssh-key` 贴公钥 → 保存
- [ ] `sftp -P 2022 <email>@sftpgo-production-a929.up.railway.app` 用对应私钥能登
- [ ] web 上传文件 → SFTP 能看到
- [ ] SFTP 上传文件 → web 能看到 → bluedux DB `audit_log` 有新行
- [ ] MCP Inspector / Claude Desktop 连 `https://bluedux-mcp-production.up.railway.app/mcp` → OAuth → list_files

## TODO（生产化 / 后续迭代）

- 把 `admin/noneed` 换成长随机密码 + 单独 service-account admin 给 bluedux-api 用
- 自定义域名 `mcp.bluedux.com`（CNAME → bluedux-mcp 的 Railway target）
- file_versions / signatures / proof 等数据 model（plan 里定的"完整图"功能）
- 限流 + DDoS 防护（Cloudflare 已经一部分；可加 Auth0 brute-force protection、sftpgo defender）
- Sentry / OTel observability 接入
- CI/CD（GitHub Actions: typecheck + build + railway up on merge）
