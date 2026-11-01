# New-site V2: Google + email-code dual login and platform API automation

## Zero-loss migration
Back up D1 first; run migration 0016_email_login.sql. Google user IDs, google_sub, sessions, orders and credits are unchanged.
Legacy Google users must sign in with Google once and explicitly verify their own email in account settings before email login is allowed.
New email users verify an 8-digit code. Admin accounts remain Google-only. Codes expire in 10 minutes and are single-use.
The feature flag EMAIL_LOGIN_ENABLED remains false until verified email sending, Turnstile and the migration are tested.

## Platform-level credentials
Copy .dev.vars.platform.example to .dev.vars.platform (gitignored) and enter CLOUDFLARE_API_TOKEN and RESEND_ADMIN_API_KEY.
Only store site runtime secrets (such as TURNSTILE_SECRET_KEY and a Resend sending-only key) in .dev.vars.production.
Never copy platform administrator credentials into a Worker or Git.

## Configure site.setup.json platforms
将 site.setup.example.json 复制为 site.setup.json，或由 new-site 脚本在文件不存在时创建。站点域名默认读取 src/config/site.ts；按需开启 Turnstile、Analytics 和 Resend DNS。Cloudflare accountId、zoneId 和 Turnstile Site Key 可省略。开启相关功能时，脚本使用平台 Token 按站点域名查找已有 Zone，必要时逐级查找父域，从唯一匹配的 Zone 获取两个 ID。Token 至少需要读取该 Zone 的权限，其他操作还需要各自的权限。

`--plan` 仍完全离线；`--verify` 只读取，不创建、不保存。`--apply` 找不到 Zone 时，会在唯一可访问的账号中创建；存在多个账号时必须填写 `platforms.cloudflare.accountId`，已有 zoneId 不可见或冲突时停止。创建后立即保存 ID，方便后续步骤失败时重试。若 Zone 未激活，脚本输出 Cloudflare 分配的 nameserver；不会切换注册商设置。切换前必须核对并迁移原有 DNS 记录，邮件等业务可能受影响。创建 Zone 的 Token 需具备 Zone 编辑权限，并确认 Wrangler 使用同一个账号。`--config` 和 `--wrangler` 自定义路径会传给平台步骤，运行密钥文件使用 setup 中的 `secrets.file`。
Configure platforms.resend.enabled, dns, allowMx and createSendingKey. MX changes are opt-in and existing DNS conflicts are never overwritten.

Resend 发送密钥只在创建时返回明文。创建后立即保存到本地运行密钥文件；如果远端已有同名密钥而本地没有值，初始化会创建一个新的限域发送密钥并保留旧密钥，确认不再使用后可在 Resend 后台清理旧密钥。已存在的 Worker secret 不会自动覆盖，应分别核实同步状态。

## Run commands
npm run setup:platforms -- --plan
npm run setup:platforms -- --apply
npm run setup:platforms -- --verify

The master command `npm run setup -- --apply` also runs enabled V2 platform steps before Waffo and runtime secret sync.

The default --plan never reads platform secrets or makes network requests.
--apply creates/reuses Cloudflare Turnstile and Web Analytics and Resend domain/restricted sending credentials, then writes local site settings.
--verify is read-only and requires platform credentials.
Google OAuth client creation, domain ownership and payment/Kie live validation still require separate acceptance.
No production deployment or secret overwrites happen automatically.

Run npm run typecheck, npm test, npm run build, npm run doctor and end-to-end authentication tests locally before deploying.
