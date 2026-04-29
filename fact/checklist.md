# 验证清单

每次大改后过一遍，确认没有退化。

- [ ] `https://bluedux.com` 显示 Welcome + Sign in with Google 按钮
- [ ] 点击登录 → 跳 Auth0 → Google 授权 → 跳回 `/files` 列表（首次会自动 provision）
- [ ] `/settings/ssh-key` 贴公钥 → 保存
- [ ] `sftp -P 2022 <email>@sftpgo-production-a929.up.railway.app` 用对应私钥能登
- [ ] web 上传文件 → SFTP 能看到
- [ ] SFTP 上传文件 → web 能看到 → admin `/audit` 有新 row
- [ ] **Claude.ai → Settings → Connectors → Add custom connector → URL `https://mcp.bluedux.com/mcp` → Connect → Continue with Google → 进入 connector，4 个工具可用**
- [ ] 全新 Google 账户（在 bluedux 没注册过）走上面这条 → 自动 first-touch provision，admin `/users` 看到新行
- [ ] admin `/users` 点 Delete → sftpgo 文件被清 + 账号删除 + db 行删除
- [ ] 同一 Google 账户再 Connect → 重新 provision，home dir 是空的
- [ ] `https://bluedux-admin-production.up.railway.app` Basic Auth 进入 → 看到 audit + users + Delete 按钮
