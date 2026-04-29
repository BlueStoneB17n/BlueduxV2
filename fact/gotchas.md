# 重要事实 / 踩过的坑

> 这里是历史踩坑全集；最关键的几条已经被提到 `fact.md` 顶部"红线"——这边还是保留全部，方便排查具体怪现象时 Ctrl-F。

1. **`RAILWAY_DOCKERFILE_PATH` 是关键**：单 monorepo 多 service，每个 service 设 env var 指向自家 Dockerfile，root dir 都用 `/`（仓库根），让 workspace symlink 跨 package 可达。
2. **`pnpm deploy --prod` 输出 self-contained 目录**：runtime 镜像直接拷这个产物。否则 lockfile 不匹配 + symlink 失效。
3. **tsup `noExternal: [/^@bluedux\//]`**：把 workspace 包内联进 bundle，否则 runtime 会尝试 import `.ts` 源码（Node 22 不支持 node_modules 里 strip TS types）。
4. **Auth0 access_token 默认不含 email/name claim**：profile claims 在 id_token 或 `/userinfo` endpoint。`bluedux-api` 的 provision 走双路径：先看 JWT 里 namespaced custom claim `https://bluedux.com/email`（MCP 路径靠 Action 注入），没有再 fallback 调 `/userinfo`（web 路径有 `openid` scope，能拿到）。Claude.ai 不传 `openid`，所以 MCP 路径必须靠 custom claim 兜住——见 #20。
5. **Auth0 web app 必须 Authorize `bluedux api`**：默认是 OFF，登录会以 `Client xxx is not authorized to access resource server` 失败。
6. **Auth0 SDK v4 路由是 `/auth/login`**：不是 v3 的 `/api/auth/login`。
7. **sftpgo username = email**：`@`、`.` 在 Linux 文件名合法。sftpgo 默认 `naming_rules` 允许 email。
8. **sftpgo password 派生**：HMAC-SHA256(env key, auth0_sub)，不存库、不下发；用户视角永远不知道这个密码。SSO 完成 + SSH key 上传后，bluedux-api 用这个派生密码做 sftpgo HTTP API user-context login。
9. **Railway internal DNS**：`<service>.railway.internal` 同 project 同 environment 内可达，免出网费 + 更快。
10. **GCP OAuth client 共用**：原 sftpgo OIDC 用的 GCP OAuth client 现在被 Auth0 复用，redirect URI 加了 Auth0 那条；JavaScript origins **不要**加 callback URL（那是给 SPA 用的）。
11. **Cloudflare 橙云 OK**：之前担心 CF cert 与 Railway cert 冲突，实测 SSL/TLS = Full (strict) 模式下两层 TLS 没问题；橙云顺带 CDN/DDoS。
12. **sftpgo Volume 文件持久**：删用户账号不删 home_dir 文件；重建同名用户会复用旧目录。具体操作流程见 #23（admin 删用户先用用户身份 RemoveAll 再删账号）。
13. **sftpgo Event Manager rule 通过 `loaddata` 一次性 import**：`events-webhook.json` 不入仓库（gitignored，含 webhook secret），文档里描述清结构，import 后规则在 Postgres 里活到永远。
14. **PRM endpoint 路径是 `/.well-known/oauth-protected-resource/mcp`**（路径段后缀跟 resource 路径，RFC 9728），不是根路径 `/.well-known/oauth-protected-resource`。MCP TS SDK 的 `getOAuthProtectedResourceMetadataUrl()` 严格按这个规则拼。
15. **PRM `resource` 必须等于 MCP server 自己的 origin URL**（当前是 `https://mcp.bluedux.com/mcp`），**不能**为了图省事写成 audience。MCP SDK 的 `checkResourceAllowed()` 按 `requested.origin === configured.origin && requestedPath.startsWith(configuredPath)` 校验。
16. **MCP 自己的 audience 跟 api 的 audience 不同**：`bluedux mcp` API identifier = `https://mcp.bluedux.com/mcp`，`bluedux api` identifier = `https://api.bluedux.com`。Claude.ai 走 RFC 8707 `resource=` → Auth0 找匹配 API → 签 `aud=resource`。**bluedux.api 的 middleware 接受两个 audience**（`apps/api/src/middleware/auth.ts` 的 `audiences` 数组），因为 MCP server 把同一个 JWT 转发给 api。
17. **Auth0 application 总数有上限**（free/dev tier 约 10 个）。每个 Claude.ai 用户/profile 通过 DCR 增加 1 个 third-party `Claude` application。需要定期手动清理或者写 Auth0 Management API 自动 GC stale DCR client。规模化前要么升级 plan 要么部署 DCR proxy。
18. **DCR client 默认是 third-party**——很多权限默认禁。三个开关必须打开：
    - `Settings → Advanced → Enable Application Connections`（让新 application 自动有 connection）
    - `Authentication → Social → Google → Settings → Promote Connection to Domain Level`（third-party 也能用 Google）
    - `bluedux mcp API → Settings → Default Permissions for Third Party Apps`（默认授权 3 个 scope，跳过逐个 client 手动 Authorize）
19. **Auth0 Action `addScope()` 进入"白名单模式"**：调一次后 access token 里**只剩**显式 add 的 scope。即使是 OIDC 标准 scope（`openid` / `profile` / `email`）也会被吞掉——所以白名单要全列。
20. **Claude.ai connector 流程会过滤掉 OIDC scope**：即使 PRM advertise `openid profile email`，Claude.ai 在 `/authorize` 也只传 `read:files write:files delete:files offline_access`。结果 token 没 openid → Auth0 `/userinfo` 必拒。**workaround**：用 Auth0 Action 把 `email` / `name` 注入成 namespaced custom claim（`https://bluedux.com/email`），bluedux.api 直接从 JWT 读，绕开 `/userinfo`。
21. **CORS 必须**：Claude.ai web 浏览器会发 OPTIONS preflight。MCP server 必须返回 204 + `Access-Control-Allow-{Origin,Methods,Headers}` + `Access-Control-Expose-Headers: WWW-Authenticate`（让 client 能读到 challenge 里的 `resource_metadata=`）。少这一步，浏览器拦下真请求，Claude.ai 报 "Couldn't reach the MCP server"。
22. **Railway `redeploy` ≠ 拉新 git**：`railway redeploy` 重跑上一次的镜像（不重新 build）。要让最新 commit 进生产用 `railway up --service <name> --detach`（基于本地 git tree 做 fresh build + push）。
23. **sftpgo `DELETE /api/v2/users/<u>` 不删 home_dir 文件**：volume 上的文件还在，重建同名用户会复用旧目录（quota 也是脏的）。Admin 删用户必须先以用户身份 purge——具体是 `DELETE /api/v2/user/dirs?path=<entry>`（sftpgo 内部 `RemoveAll`，递归处理文件 + 目录），然后再删账号。
24. **sftpgo `mode` 字段是 Go `os.FileMode` 不是 POSIX `mode_t`**：dir 标志位是 bit 31 (`0x80000000`)，不是 Unix `S_IFDIR (0o40000)`。同时 `size` 字段对非 regular file（目录、symlink）**根本不返回**（看 sftpgo `api_utils.go:319` 只在 `IsRegular()` 时才写）。client 端 isDir 必须用 `mode & 0x80000000`，size 必须 `?? 0`。
