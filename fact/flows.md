# 用户/客户端流程

## Web 登录

1. 用户访问 `bluedux.com` → 看登录按钮 → 点 → `/auth/login`（Auth0 SDK v4 中间件接管）
2. SDK 重定向到 `https://bluedux.us.auth0.com/authorize?...&audience=https://api.bluedux.com&scope=openid profile email read:files ...&code_challenge=...`（PKCE）
3. Auth0 → Google → 用户授权 → 回 Auth0 → 回 `/auth/callback` 带 `code`
4. SDK 用 `code` + `code_verifier` 换 access_token + id_token，写 session cookie
5. 重定向到 `/files`
6. `/files` server component 读 session，对 bluedux.api 请求 `/v1/me/provision`（首次登录）→ bluedux DB 写 user 行 + sftpgo admin 调 `POST /api/v2/users`：username=email、home_dir=`/srv/sftpgo/data/<email>`、password = HMAC-SHA256(`SFTPGO_USER_PASSWORD_KEY`, `auth0_sub`)、quota=300MB
7. 之后所有 `/files` 操作走 `/api/proxy/*` → bluedux.api（带 Bearer）→ sftpgo

## SFTP 客户端登录

1. 用户在 `/settings/ssh-key` 贴 SSH 公钥 → bluedux.api `PUT /v1/me/sshkey` → 写 bluedux DB + 调 sftpgo 更新 `public_keys`
2. 客户端 `sftp -P 2022 <email>@sftpgo-production-a929.up.railway.app`，用对应私钥 → sftpgo 校验 pubkey → 登录成功
3. 上传/下载文件触发 sftpgo Event Manager `bluedux-fs-events` → `POST http://bluedux-api.railway.internal:8080/v1/webhooks/sftpgo`（含 `X-SFTPGO-Webhook-Token`）→ bluedux DB `audit_log` 行

## MCP 客户端登录（Claude.ai / Claude Code custom connector）— 主路径

**用户视角**：Claude.ai → Settings → Connectors → Add custom connector → URL `https://mcp.bluedux.com/mcp` → Connect → 弹 Auth0 同意页 → Accept → 完成。所有工具 (`list_files / read_file / write_file / delete_file`) 立刻在聊天里可用。

**协议视角**（这套已经在生产环境跑通）：

1. Claude.ai POST `/mcp` 无 token → MCP 返回 **401** + `WWW-Authenticate: Bearer realm="bluedux.mcp", error="invalid_token", resource_metadata="https://mcp.bluedux.com/.well-known/oauth-protected-resource/mcp"`（CORS 头同时附上）
2. Claude.ai GET `/.well-known/oauth-protected-resource/mcp` → 收到 PRM：
   ```json
   {
     "resource": "https://mcp.bluedux.com/mcp",
     "authorization_servers": ["https://bluedux.us.auth0.com"],
     "scopes_supported": ["openid","profile","email","read:files","write:files","delete:files"],
     "bearer_methods_supported": ["header"]
   }
   ```
3. Claude.ai GET `https://bluedux.us.auth0.com/.well-known/openid-configuration` → 拿到 `registration_endpoint=/oidc/register`、`authorization_endpoint=/authorize`、`token_endpoint=/oauth/token`、`jwks_uri`
4. Claude.ai POST `/oidc/register`（DCR / RFC 7591）→ Auth0 创建一个 third-party `Claude` Generic application，返回 `tpc_xxxxx` client_id。**Auth0 application 总数 +1**（受 tenant 上限约束）
5. Claude.ai 弹浏览器 → `https://bluedux.us.auth0.com/authorize?client_id=tpc_xxx&redirect_uri=https://claude.ai/api/mcp/auth_callback&response_type=code&code_challenge=...&scope=read:files+write:files+delete:files+offline_access&resource=https://mcp.bluedux.com/mcp&prompt=consent`（注意 Claude.ai 主动**过滤掉了** OIDC scope，PRM 里 advertise 也没用——所以才需要 Action 注 custom claim）
6. Auth0：找到 `bluedux mcp` API（identifier 匹配 `resource`）→ 检查 grant（"Default Permissions for Third Party Apps" 已默认授权）→ 显示同意页 → 用户点 Continue with Google → Google → 回 Auth0 → 重定向回 Claude.ai 带 `code`
7. Claude.ai POST `/oauth/token` 用 PKCE verifier 换 access_token：
   - `aud=https://mcp.bluedux.com/mcp`
   - `scope=read:files write:files delete:files openid profile email offline_access`（Action 已加 OIDC scope 进白名单）
   - 含 custom claim `https://bluedux.com/email` 和 `https://bluedux.com/name`
8. 之后 Claude.ai 每次 POST `/mcp` 带 `Authorization: Bearer <jwt>`：
   - bluedux-mcp `verifyBearer` 校验 `aud=https://mcp.bluedux.com/mcp` ✓
   - MCP `ensureProvisioned()` 调 bluedux.api `/v1/me` → 404 → `/v1/me/provision`
   - api `requireAuth` 校验 `aud ∈ {api.bluedux.com, mcp.bluedux.com/mcp}` ✓
   - api 从 JWT 直接读 `email` / `name` custom claim → upsert `users` 行 → sftpgo `POST /api/v2/users` 建账号（home_dir=`/srv/sftpgo/data/<email>`，密码 = HMAC-SHA256(`SFTPGO_USER_PASSWORD_KEY`, `auth0_sub`)）
   - MCP 工具调用走通

**第一次接入也是这条路**：用户从来没在 bluedux web 注册过没关系——first-touch provision 在第 8 步自动建账号。同样适用于 admin 删用户后再连接：sftpgo 账号 + db 行重建，文件不残留（admin 删用户时 purge 已 wipe）。

## Admin（运维）

1. 浏览器访问 `https://bluedux-admin-production.up.railway.app`
2. 弹 HTTP Basic Auth：username 任意，password = `BLUEDUX_ADMIN_PASSWORD`
3. middleware 校验 → 通过后 SSR 调 bluedux.api `/v1/admin/audit`（带 X-Admin-Token）→ 拿 audit_log + users
4. UI 展示：
   - `/audit` — audit_log 列表
   - `/users` — users 列表，每行带 **Delete** 按钮（confirm dialog → DELETE `/v1/admin/users/:id`）
5. 删用户做的事：
   - 用 `auth0_sub` 重算 sftpgo 密码 → user-token 登入 → 遍历 `/` 下所有 entry → `DELETE /api/v2/user/dirs?path=/<name>`（sftpgo 内部 `RemoveAll`，递归）→ 文件全清
   - sftpgo `DELETE /api/v2/users/<username>` → 用户记录删除
   - bluedux DB：`DELETE FROM audit_log WHERE user_id = $1` → `DELETE FROM users WHERE id = $1`
   - **不动** Auth0 那边的用户身份（同 sub 再连接会触发 first-touch provision 重建）
