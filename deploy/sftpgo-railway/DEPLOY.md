# BlueduxV2 · sftpgo on Railway 部署记录

记录从零把 sftpgo 部署到 Railway 的全过程、最终架构、踩到的坑、以及下次重做时的防坑 checklist。

---

## 1. 当前部署状态

| 项 | 值 |
|---|---|
| Railway 项目 | `bluedux` |
| Service | `sftpgo`（Docker，自定义镜像） |
| 公网 URL | https://sftpgo-production-a929.up.railway.app |
| Web Admin | `/web/admin/login` |
| Web Client | `/web/client/login`（普通用户用） |
| Google SSO | `/web/client/oidclogin`（Web Client 登录页有 "Sign in with OpenID" 按钮） |
| 自动注册 | 任意 Google 账号首次登录 → 自动建普通用户、配 300MB quota（Event Manager `IDPAccountCheck` 规则驱动） |
| REST API | `/api/v2/...`（HTTP Basic 拿 token） |
| 初始 admin | `admin` / `noneed` |
| 元数据库 | Railway Postgres（同项目 `Postgres` service） |
| 用户文件存储 | Railway Volume `sftpgo-volume` → 容器内 `/srv/sftpgo/data` |
| SFTP/FTP/WebDAV | **未对外暴露**（只开了 HTTP；要开 SFTP 需在 Railway 加 TCP Proxy） |

---

## 2. 架构

```
浏览器/客户端
     │  HTTPS
     ▼
┌────────────────────────────────────┐
│   Railway Edge (HTTPS proxy)       │
│   - 自动 TLS                        │
│   - 加 X-Forwarded-For header      │
└────────────────────────────────────┘
     │  HTTP :8080
     ▼
┌────────────────────────────────────┐    ┌─────────────────────┐
│  sftpgo container                   │───▶│  Postgres service   │
│  - 自定义镜像 (USER 0:0)            │    │  (Railway managed)  │
│  - 监听 8080 (HTTP), 2022 (SFTP)   │    │  存 admin/users     │
│  - 进程以 root 跑                   │    │  + event rules      │
│  - entrypoint: chmod 0777 data dir  │    └─────────────────────┘
│                                    │              ▲
│  /srv/sftpgo/data ◀── Volume       │              │
│   ├── steven@bluestone.one/        │      OIDC IDP login 时
│   ├── alice@gmail.com/             │      触发的 IDPAccountCheck
│   └── ...（每个 Google 用户一目录）│      会自动 INSERT user 行
│                                    │
│  /var/lib/sftpgo                   │
│   ├── static/branding/hide-logo.css│
│   └── host keys（短暂）            │
└────────────────────────────────────┘
                ▲
                │ OIDC redirect
        ┌───────┴────────┐
        │ Google IdP     │
        │ accounts.google│
        └────────────────┘
```

**职责分工**：
- **Postgres**：所有结构化元数据（admin、users、folders、shares、API keys、events log、event rules）。重启不丢。
- **Volume**：用户实际上传的文件内容。重启不丢。
- **容器临时存储**：host keys、log。重启会丢，没用到 SFTP 暂时无影响。

---

## 3. 关键文件（仓库内）

```
BlueduxV2/deploy/sftpgo-railway/
├── Dockerfile                  ← 自定义镜像（USER 0:0 + branding CSS + chmod entrypoint）
├── railway.json                ← 告诉 Railway 用 Dockerfile 构建
├── events-bootstrap.json       ← Event Manager 规则定义（gitignored，一次性 import）
└── DEPLOY.md                   ← 本文件
```

> **`events-bootstrap.json` 不进 git**（在 `.gitignore` 里）。它是"运行时数据"——一次性通过 `/api/v2/loaddata` 导入到 Postgres 后规则永久生效，文件本身不需要持续存在。完整内容见 §"附录：events-bootstrap.json"。

**Dockerfile** 当前内容：
```dockerfile
FROM drakkan/sftpgo:alpine
USER 0:0

# Custom branding overrides (loaded via SFTPGO_HTTPD__BINDINGS__0__BRANDING__WEB_CLIENT__EXTRA_CSS)
RUN mkdir -p /var/lib/sftpgo/static/branding && \
    printf '%s\n' '.app-sidebar-logo{display:none!important;}' \
    > /var/lib/sftpgo/static/branding/hide-logo.css

# Volume on /srv/sftpgo/data is bind-mounted by Railway with restrictive perms.
# Open it up at startup so the in-container root user can mkdir per-user homes.
CMD ["sh", "-c", "chmod 0777 /srv/sftpgo/data 2>&1 || echo 'chmod failed (continuing)'; exec sftpgo serve"]
```

**railway.json**：
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" }
}
```

---

## 4. 完整环境变量清单

```bash
# ── 默认 admin 自动创建 ──────────────────
SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN=true
SFTPGO_DEFAULT_ADMIN_USERNAME=admin
SFTPGO_DEFAULT_ADMIN_PASSWORD=noneed

# ── 元数据库（Postgres）─────────────────
SFTPGO_DATA_PROVIDER__DRIVER=postgresql
SFTPGO_DATA_PROVIDER__HOST=${{Postgres.PGHOST}}
SFTPGO_DATA_PROVIDER__PORT=${{Postgres.PGPORT}}
SFTPGO_DATA_PROVIDER__NAME=${{Postgres.PGDATABASE}}
SFTPGO_DATA_PROVIDER__USERNAME=${{Postgres.PGUSER}}
SFTPGO_DATA_PROVIDER__PASSWORD=${{Postgres.PGPASSWORD}}
SFTPGO_DATA_PROVIDER__SSLMODE=0

# ── 用户文件 / 备份目录（Volume 内）─────
SFTPGO_DATA_PROVIDER__USERS_BASE_DIR=/srv/sftpgo/data
SFTPGO_DATA_PROVIDER__BACKUPS_PATH=/srv/sftpgo/data/backups

# ── Railway 反向代理适配（关键！）────────
SFTPGO_HTTPD__BINDINGS__0__CLIENT_IP_PROXY_HEADER=X-Forwarded-For
SFTPGO_HTTPD__BINDINGS__0__PROXY_ALLOWED=0.0.0.0/0,::/0
SFTPGO_HTTPD__BINDINGS__0__PROXY_MODE=0          # 必须 0，不要开
SFTPGO_HTTPD__TOKEN_VALIDATION=1                  # 关闭 JWT 绑 IP（关键）

# ── Google OIDC（Web Client SSO）────────
SFTPGO_HTTPD__BINDINGS__0__OIDC__CLIENT_ID=<GCP-OAuth-client-id>
SFTPGO_HTTPD__BINDINGS__0__OIDC__CLIENT_SECRET=<GCP-OAuth-client-secret>
SFTPGO_HTTPD__BINDINGS__0__OIDC__CONFIG_URL=https://accounts.google.com
SFTPGO_HTTPD__BINDINGS__0__OIDC__REDIRECT_BASE_URL=https://sftpgo-production-a929.up.railway.app
SFTPGO_HTTPD__BINDINGS__0__OIDC__SCOPES=openid,profile,email
SFTPGO_HTTPD__BINDINGS__0__OIDC__USERNAME_FIELD=email     # Google 没有 preferred_username，用 email
SFTPGO_HTTPD__BINDINGS__0__OIDC__IMPLICIT_ROLES=true       # 关键：webclient 入口强制为普通用户
SFTPGO_HTTPD__BINDINGS__0__OIDC__UI_NAME=Google             # 登录页按钮文字

# ── 品牌定制（隐藏 sidebar logo）─────────
SFTPGO_HTTPD__BINDINGS__0__BRANDING__WEB_CLIENT__EXTRA_CSS=/branding/hide-logo.css
```

`${{Postgres.PG*}}` 是 Railway 跨 service 变量引用，密码轮转后自动同步。

GCP OAuth Client 必须配 redirect URI（**精确匹配**）：
```
https://sftpgo-production-a929.up.railway.app/web/oidc/redirect
```

---

## 5. 部署流程（从零再做一遍）

```bash
# 0. 准备：本地装好 mise、railway CLI，已 railway login

# 1. 在项目根创建 deploy 目录（已存在则跳过）
mkdir -p BlueduxV2/deploy/sftpgo-railway
cd BlueduxV2/deploy/sftpgo-railway

# 2. 写 Dockerfile + railway.json（见上面 §3）

# 3. link Railway 项目
railway link --project bluedux --environment production

# 4. 一次性创建 sftpgo service
railway add --service sftpgo \
  --variables "SFTPGO_DEFAULT_ADMIN_USERNAME=admin" \
  --variables "SFTPGO_DEFAULT_ADMIN_PASSWORD=noneed" \
  --variables "SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN=true"

# 5. 加 Postgres
railway add --database postgres
# 等 30 秒让 Postgres 就绪

# 6. link 当前目录到 sftpgo service（必须做，否则 volume CLI 会 panic）
railway service sftpgo

# 7. 加 volume
railway volume add --mount-path /srv/sftpgo/data
#                                ^^^^^^^^^^^^^^^^
#  注意：是 /srv/sftpgo/data 不是 /var/lib/sftpgo！

# 8. 设置基础环境变量（数据库 + Volume 路径 + Railway 代理 + 关闭 JWT IP 绑定）
#    见 §4 的前 4 块。具体命令略，把上面 ── 标记的几块用 --set 一次设上。

# 9. 上传源码（Dockerfile）触发构建
railway up --service sftpgo --ci

# 10. 生成公网域名（target port 必须显式 8080）
railway domain --service sftpgo --port 8080

# 11. 烟雾测试
curl -u admin:noneed https://<your-domain>/api/v2/token
# 期望：HTTP 200 + {"access_token":"..."}

# ─── Google SSO 配置（增量步骤，不依赖前面任意一步） ──────

# 12. 在 GCP Console 建 OAuth Client（详见下方 §"Google Cloud Console"）
#     拿到 client_id 和 client_secret，下载 client_secret_*.json（**保密，不进 git**）

# 13. 设 OIDC + branding 环境变量（见 §4 后两块），然后 redeploy
railway variables --service sftpgo \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__CLIENT_ID=<…>' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__CLIENT_SECRET=<…>' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__CONFIG_URL=https://accounts.google.com' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__REDIRECT_BASE_URL=https://<your-domain>' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__SCOPES=openid,profile,email' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__USERNAME_FIELD=email' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__IMPLICIT_ROLES=true' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__OIDC__UI_NAME=Google' \
  --set 'SFTPGO_HTTPD__BINDINGS__0__BRANDING__WEB_CLIENT__EXTRA_CSS=/branding/hide-logo.css'
railway redeploy --service sftpgo --yes

# 14. **一次性** 把 events-bootstrap.json 推到 sftpgo（创建 IDPAccountCheck rule）
#     文件内容见 §"附录"；先在本地写好（不进 git）
TOKEN=$(curl -sk -u admin:noneed https://<your-domain>/api/v2/token \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -sk -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @events-bootstrap.json \
  "https://<your-domain>/api/v2/loaddata?mode=0"
# 期望：{"message":"Data restored"} + HTTP 200

# 15. e2e 验证
#     - 无痕窗口访问 https://<your-domain>/web/client/login
#     - 点 "Sign in with OpenID" → Google 授权
#     - 登录成功后 admin 后台 Users 列表自动出现新行
#     - 列表里 quota = 300 MB，home_dir = /srv/sftpgo/data/<email>
#     - 上传 ~100MB 成功，上传 400MB 应被拒绝
```

### Google Cloud Console（拿 client_id/secret）

1. https://console.cloud.google.com → 选/建 GCP 项目
2. **APIs & Services → OAuth consent screen**
   - User Type: External
   - App name 任意
   - Authorized domain: `up.railway.app`
   - Scopes: `openid` / `email` / `profile`
   - 留 Testing 状态最安全（只列出的 Test users 能登）
3. **APIs & Services → Credentials → Create OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://<your-domain>/web/oidc/redirect`（**精确**）
4. 复制 Client ID + Client Secret 用于 §5 step 13

---

## 6. 踩过的坑 + 修法（按出现顺序）

### 坑 1 · `railway add` 用 image 模式时 service 没执行实际部署的初始化
**现象**：先用 `--image drakkan/sftpgo:alpine` 创建 service，看似 SUCCESS，但容器 crash loop。
**原因**：image-based service 不能加自定义 USER/entrypoint。
**修法**：放弃 image 模式，改用 Dockerfile 模式 + `railway up`。

### 坑 2 · `railway volume add` panic（Rust unwrap None）
**现象**：
```
thread 'main' panicked at src/commands/volume.rs:571:10:
called `Option::unwrap()` on a `None` value
```
**原因**：CLI 不会 fallback 到 prompt 选 service，必须先 `railway service <name>` 选中。
**修法**：先 `railway service sftpgo`，再 `railway volume add --mount-path ...`。

### 坑 3 · `unable to open database file: no such file or directory`
**现象**：sftpgo 启动 sqlite 时报错，db 文件创建不出来。
**原因**：Volume mount path = `/var/lib/sftpgo`，但镜像里这个目录是 `sftpgo:sftpgo` 1000 用户拥有；Railway volume 默认 root 挂上来后变成 root:root，sftpgo user 无写权限。
**修法**：(1) 把 volume mount 改到 `/srv/sftpgo/data`；(2) Dockerfile 加 `USER 0:0`。

### 坑 4 · `attempt to write a readonly database`（sqlite + Volume）
**现象**：换了 mount path 后，错误从 "no such file" 变成 "readonly database"。
**原因**：sqlite 需要在 db 文件同目录创建 `-wal`、`-shm`、`-journal` 临时文件，Railway volume 的 bind mount 行为让 sqlite 这套机制工作不稳。
**修法**：**别用 sqlite**。一键加 Postgres：`railway add --database postgres`，再用 `${{Postgres.PG*}}` 引用配进 sftpgo。

### 坑 5 · 登录跳来跳去回到 setup 页（admin 没创建出来）
**现象**：访问 `/web/admin/login` 一直 302 到 `/web/admin/setup`。
**原因**：只设 `SFTPGO_DEFAULT_ADMIN_USERNAME` + `_PASSWORD` **不够**，必须同时显式开启 `SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN=true`（默认 false）。
**修法**：加上这个 env var，redeploy。

### 坑 6 · 浏览器登录显示"账号密码错误"，但 API 测试 admin/noneed 是对的
**现象（最坑）**：
- `curl -u admin:noneed /api/v2/token` → HTTP 200 + JWT token ✅
- 浏览器表单提交 → "账号密码错误" ❌
**真实原因**：sftpgo 默认把 JWT session 的 audience 绑到 client IP；Railway 前端是多 edge instance，访问者经过 CGNAT 的话源 IP 每个请求都不一样（实测 `157.52.64.36/.51/.56` 在几秒内出现）。每次 POST 都因 IP 变更而 `invalid_csrf`，UI 文案误导成"密码错"。
**修法（同时做 3 件事，缺一不可）**：
1. `SFTPGO_HTTPD__BINDINGS__0__CLIENT_IP_PROXY_HEADER=X-Forwarded-For`
2. `SFTPGO_HTTPD__BINDINGS__0__PROXY_ALLOWED=0.0.0.0/0,::/0`
3. `SFTPGO_HTTPD__TOKEN_VALIDATION=1` — **核心**
**反例**：不要设 `PROXY_MODE=1`！那是 HAProxy PROXY Protocol（TCP 二进制前缀），Railway 不发，开了直接启动失败：`could not start HTTP server: proxy protocol not configured`。

### 坑 7 · OIDC 登录后报 "Failed to get user associated with OpenID token"
**现象**：Google 授权回来后 sftpgo 报这个错，admin 后台用户列表也没新增。
**原因**：events-bootstrap.json 里 `actions[].options` 写错位置——sftpgo 的 EventRule.Actions 用的字段是 **`relation_options`**，里面才是 `execute_sync`。我误把它放到 `options` 里，结果 `execute_sync` 默认 false，规则被 `eventmanager.go:438` 判定为异步执行 → IDPAccountCheck 不走"创建用户"分支 → 找不到用户。
日志佐证：`[WARN] rule "idp-google-auto-register" skipped: IDP account check must be a sync action`。
**修法**：改 events-bootstrap.json 把 actions 数组里的 `options` 改成 `relation_options`，重新 `loaddata`。

### 坑 8 · OIDC 登录报 "Invalid authentication request — does not meet security requirements"
**现象**：第一次 Google 授权失败后再尝试，看到这条错误。
**原因**：sftpgo 的 OAuth `state` 是一次性的，存在内存 map 里（`memoryOIDCManager.pendingAuths`），处理一次就 `removePendingAuth`。如果浏览器刷新错误页/从历史记录访问之前那个 redirect URL，state 已不在 map 里，校验失败。**这跟配置无关，是浏览器重放问题**。
**修法**：彻底关闭 sftpgo tab，开**全新无痕窗口**，从 `/web/client/login` 完整重走一遍 OAuth flow，不要从 history/缓存进入 redirect URL。

### 坑 9 · 用户登录成功但 "Failed to get directory listing"
**现象**：OIDC 登进 Web Client 但 Files 页报这个错。日志显示 `mkdir /srv/sftpgo/data/<email>: permission denied`，即使 sftpgo 进程是 root（USER 0:0）。
**原因**：Railway 的 Volume bind mount 在容器 root 用户上仍然 deny mkdir 子目录（推测是 user namespace 把容器 root 映射到 host unprivileged user，CAP_DAC_OVERRIDE 失效；具体平台行为）。
**修法**：在 Dockerfile 的 entrypoint 里 `chmod 0777 /srv/sftpgo/data` 一次。这次在 mount 已经挂上之后执行，能成功改 mode；之后 mkdir 子目录就 OK。
```dockerfile
CMD ["sh", "-c", "chmod 0777 /srv/sftpgo/data 2>&1 || echo 'chmod failed (continuing)'; exec sftpgo serve"]
```

### 坑 10 · 第一次 mkdir 失败留下"幽灵用户"，修好权限后还是 list 不出来
**现象**：坑 9 修了之后，老用户继续报 `lstat ... no such file or directory`。
**原因**：sftpgo 在 `user.go:255` 有逻辑：若 `last_login` 时间近期则**跳过 CheckRootPath**（认为 fs 已 ready），直接走 list。第一次失败时 last_login 已经被写入 Postgres，后续连接永远跳过 mkdir。
**修法**：通过 admin API 删掉这个用户，让 OIDC 重新走"首次登录建号 + CheckRootPath + mkdir"完整流程：
```bash
curl -H "Authorization: Bearer $TOKEN" -X DELETE \
  https://<domain>/api/v2/users/<email>
```

### 坑 11 · Event Manager 规则修改后立即生效（不用 redeploy）
**良性现象**：`/api/v2/loaddata` 后 sftpgo 通过 `SetEventRulesCallbacks` → `eventManager.loadRules` 自动热加载新规则；日志看到 `removed rule X → added rule X → event rules updated`。结论：改 events-bootstrap.json 后只需 `loaddata` 不必重启容器。

---

## 7. 下次重新部署的 Checklist（贴墙）

**基础设施**
1. ☑ 不要用 image-based service，统一用 2-5 行 Dockerfile + `railway up`。
2. ☑ 不要把 sqlite 放 volume，配 Postgres 服务做元数据。Volume 只放 `users_base_dir`。
3. ☑ Volume mount path = `/srv/sftpgo/data`，**不要**挂 `/var/lib/sftpgo`。
4. ☑ Dockerfile entrypoint 必须 `chmod 0777 /srv/sftpgo/data`，否则 root 也 mkdir 不进去（坑 9）。

**登录可用性**
5. ☑ 三件套缺一不可：`CLIENT_IP_PROXY_HEADER=X-Forwarded-For` + `PROXY_ALLOWED=0.0.0.0/0,::/0` + `TOKEN_VALIDATION=1`。少任何一个浏览器登录都会无声失败。
6. ☑ 建 admin 必须设 `CREATE_DEFAULT_ADMIN=true`，光设 username/password 不会创建。

**Google SSO + 自动注册**
7. ☑ OIDC 8 个 env vars 全配上，`USERNAME_FIELD=email`、`IMPLICIT_ROLES=true`（避免任意 Google 账号变 admin）。
8. ☑ events-bootstrap.json 里 `actions[].relation_options.execute_sync` 必须是 `true`（不是 `actions[].options.execute_sync`，坑 7）。
9. ☑ GCP OAuth Client 的 Authorized redirect URI 必须**精确匹配** `https://<domain>/web/oidc/redirect`。
10. ☑ 走 OIDC flow 时一定要从干净状态开始，不要刷新错误页（state 是一次性，坑 8）。
11. ☑ 第一次部署完整套件后再创建用户；如果先建了用户再修 fs 权限，必须删掉用户重来（坑 10）。

**5 秒诊断**
```bash
curl -u <user>:<pass> https://<domain>/api/v2/token
# 200 + token  → 凭据 OK，问题在 Web/CSRF（坑 6）或 OIDC 流程（坑 7-10）
# 401          → 真的密码错或 admin 没建（坑 5）
# 5xx / 不响应 → 服务起不来，看 railway logs
```

诊断 OIDC 自动建号：
```bash
TOKEN=$(curl -sk -u admin:noneed https://<domain>/api/v2/token | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" https://<domain>/api/v2/eventrules \
  | jq '.[0].actions[0].relation_options.execute_sync'  # 必须是 true
```

---

## 8. 后续 TODO

- [ ] **真正的 SFTP 登录**：Railway 加 TCP Proxy 把 `2022` 暴露成 `tcp.proxy.rlwy.net:<rand>`。host keys 也需要持久化到 volume，否则每次重启 client 都要重新 trust。
- [ ] **admin 默认密码**：`noneed` 仅用于本次测试。上生产前换强密码（或改用 OIDC for admin 入口）。
- [ ] **限制 SSO 注册范围**：当前任意 Google 账号都能注册占 300MB；需要时把 OAuth Consent Screen 改 Internal（仅限 Workspace 域）或加 email 白名单（pre-login hook 路径，不是 Event Manager）。
- [ ] **SMTP**：sftpgo 的找回密码、shares 邮件通知需要 SMTP 配置；当前未配。
- [ ] **CORS / 前端域名**：将来 BlueduxV2 自研 UI 跨域调用 sftpgo REST API 时，要配 `SFTPGO_HTTPD__BINDINGS__0__CORS__*`。
- [ ] **备份**：Postgres 用 Railway 的备份；Volume 内文件需要单独备份策略（rclone 到 S3 之类）。
- [ ] **HTTPS-only redirect**：Railway 边缘已经 TLS，可在 sftpgo 加 `SECURITY__HTTPS_REDIRECT=true` 保险。
- [ ] **更精细 branding**：当前隐藏了 sidebar logo；登录页大 logo / favicon / 产品名（"WebClient"）也可以替换。

---

## 附录 · `events-bootstrap.json`（不进 git）

文件结构（`type=13` = `IDPAccountCheck`，`trigger=7` = `IDPLogin`，`idp_login_event=1` = `IDPLoginUser`，`mode=1` = 仅首次创建）：

```json
{
  "event_actions": [
    {
      "name": "idp-auto-create-user",
      "description": "Auto-create sftpgo user from Google IDP login (300MB quota)",
      "type": 13,
      "options": {
        "idp_config": {
          "mode": 1,
          "template_user": "{\n  \"username\": \"{{.Name}}\",\n  \"status\": 1,\n  \"email\": \"{{.Email}}\",\n  \"home_dir\": \"/srv/sftpgo/data/{{.Name}}\",\n  \"permissions\": {\"/\": [\"*\"]},\n  \"quota_size\": 314572800,\n  \"description\": \"Auto-created via Google SSO\"\n}"
        }
      }
    }
  ],
  "event_rules": [
    {
      "name": "idp-google-auto-register",
      "description": "Run auto-create-user action on every IDP login of a non-admin user",
      "status": 1,
      "trigger": 7,
      "conditions": { "idp_login_event": 1 },
      "actions": [
        {
          "name": "idp-auto-create-user",
          "relation_options": {
            "is_failure_action": false,
            "stop_on_failure": false,
            "execute_sync": true
          },
          "order": 1
        }
      ]
    }
  ],
  "version": 16
}
```

修改流程：编辑文件 → `curl POST /api/v2/loaddata?mode=0` 重推（按 name upsert，幂等）。容器不需要重启。
