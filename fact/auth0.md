# Auth0 配置摘要

Tenant: `bluedux.us.auth0.com`（US, Development tier）

## Applications

| 名字 | 类型 | 用途 / 说明 |
|---|---|---|
| `bluedux web` | Regular Web Application | Callback: `/auth/callback` × 3 host。Auth0 SDK v4 自动 mount。**APIs tab 必须 Authorize `bluedux api`**（默认 OFF） |
| `bluedux mcp` | Native | 历史遗留（最初规划 Claude Desktop 用的静态 client）。**Claude.ai connector 流程不用它**——Claude.ai 走 DCR 动态注册，每个用户/profile 自动产生一个 third-party `Claude` Generic application |
| `Claude` × N | Generic (Third-Party) | 每个 Claude.ai 用户/profile 通过 DCR 注册一个，client_id 形如 `tpc_xxxxxxx`。受 Auth0 application 总数上限约束（见 [`gotchas.md`](gotchas.md) #17） |

## APIs（resource servers）

| 名字 | Identifier (audience) | 用途 |
|---|---|---|
| `bluedux api` | `https://api.bluedux.com` | web/admin 流程的主 audience。Scopes: `read:files write:files delete:files manage:keys read:profile`。RS256 |
| `bluedux mcp` | `https://mcp.bluedux.com/mcp` | Claude.ai connector 流程的 audience。**Identifier 必须等于 PRM `resource` 字段**（Auth0 用它做 `resource=` 参数 lookup）。Scopes: `read:files write:files delete:files`。Allow Offline Access = ON。RS256 |

## Tenant-wide 设置（让 Claude.ai DCR + Google SSO 跑通）

按层级影响从大到小：

1. **Settings → Advanced → "Dynamic Client Registration (DCR)" = ON**：让 Claude.ai 能自动 POST `/oidc/register`
2. **Settings → Advanced → "Enable Application Connections" = ON**：新注册的 application 自动启用所有 enabled connection（不勾的话 DCR client 没 Google connection 用，会 `no connections enabled for the client`）
3. **Settings → Advanced → "Resource Parameter Compatibility Profile" = ON**：让 Auth0 接受 `resource=` 参数（RFC 8707），不光 `audience=`
4. **Settings → General → "API Authorization Settings" → Default Audience = `https://api.bluedux.com`**：保险默认值
5. **Authentication → Social → Google → Settings tab → "Promote Connection to Domain Level" = ON**：让 third-party (DCR) application 也能用 Google connection。**不开**这个开关，DCR client toggle Google 时报 "Unexpected failure trying to update the connection"，登录走不通
6. **API `bluedux mcp` → Settings → "Default Permissions for Third Party Apps"**：User Access + Client Access 都设为 **Authorized** 并勾选 3 个 scope (read:files / write:files / delete:files)。这就是给所有 DCR third-party client 默认授权 MCP API 的开关——免去逐个 client 手动 Authorize

## Action `inject-mcp-scopes`（Post Login）

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const aud = event.resource_server?.identifier;
  if (aud !== 'https://api.bluedux.com' && aud !== 'https://mcp.bluedux.com/mcp') return;
  const requested = (event.transaction?.requested_scopes ?? []);
  for (const s of ['openid', 'profile', 'email', 'read:files', 'write:files', 'delete:files']) {
    if (requested.includes(s)) api.accessToken.addScope(s);
  }
  // Identity claims for first-touch provisioning (no /userinfo round-trip)
  if (event.user.email) api.accessToken.setCustomClaim('https://bluedux.com/email', event.user.email);
  if (event.user.name)  api.accessToken.setCustomClaim('https://bluedux.com/name',  event.user.name);
};
```

干两件事：
- 显式把请求里的 scope 注入 access token——Auth0 调用 `addScope()` 后会进入"白名单模式"，**没显式 add 的 scope 全部从 token 里消失**，所以连 OIDC 标准 scope 都要列在白名单里（见 [`gotchas.md`](gotchas.md) #19）
- 把 `email` / `name` 作为 namespaced custom claim 注入 token——bluedux.api 的 `requireAuth` 直接从 JWT 读，不用打 Auth0 `/userinfo`（Claude.ai 不传 `openid` scope，`/userinfo` 必拒，见 [`gotchas.md`](gotchas.md) #20）

## Google Social Connection

复用 GCP OAuth client `449350223349-91vl1c0buo42ume2s9qmcnsf5dpm2cj2.apps.googleusercontent.com`。GCP 的 Authorized redirect URI 含 `https://bluedux.us.auth0.com/login/callback`。"Promote Connection to Domain Level" 必开（见上）。
