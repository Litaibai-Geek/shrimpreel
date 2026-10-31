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
Copy site.setup.example.json to site.setup.json. Configure platforms.cloudflare.accountId, zoneId, turnstile and analytics.
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
