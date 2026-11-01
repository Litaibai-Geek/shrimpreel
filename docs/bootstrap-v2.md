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

`--plan` 仍完全离线；`--apply` 在平台步骤成功后将发现的 ID 写回所选 setup 文件；`--verify` 只读取，不保存。已有 ID 与发现的 Zone 冲突、匹配不唯一、Zone 不存在或不可访问时会停止；不会创建 Zone、切换域名服务器，也不会猜测账户。请确保 Wrangler 登录使用同一个 Cloudflare 账户。`--config` 和 `--wrangler` 自定义路径会传给平台步骤，运行密钥文件使用 setup 中的 `secrets.file`。
Configure platforms.resend.enabled, dns, allowMx and createSendingKey. MX changes are opt-in and existing DNS conflicts are never overwritten.

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
