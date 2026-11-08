#!/usr/bin/env node
// V2 platform provisioning: explicit dry-run/apply/verify; never deploys.
// Platform admin credentials stay local, not inside site Workers.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { parseDotenv } from './sync-secrets.mjs'
import { site } from '../src/config/site.ts'

export function platformOptions(args) {
  const modes = ['--plan', '--apply', '--verify'].filter((x) => args.includes(x))
  if (modes.length > 1) throw new Error('Choose only one mode: --plan, --apply, --verify')
  return modes[0] ?? '--plan'
}

export function platformConfig(setup) {
  const domain = setup?.site?.domain || site.domain
  if (typeof domain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    throw new Error('Invalid site domain')
  }
  const cloudflare = setup.platforms?.cloudflare ?? {}
  const resend = setup.platforms?.resend ?? {}
  const routing = setup.email?.routing ?? {}
  if (routing.enabled) {
    const source = routing.source || setup.site?.adminEmail
    const validEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    if (!validEmail(source) || source.split('@')[1].toLowerCase() !== domain) throw new Error('邮件路由来源必须是本站域名下的邮箱')
    if (!validEmail(routing.destination) || routing.destination.toLowerCase() === source.toLowerCase()) throw new Error('邮件路由目标邮箱无效')
  }
  for (const key of ['accountId', 'zoneId']) {
    if (cloudflare[key] && !/^[a-f0-9]{32}$/i.test(cloudflare[key])) throw new Error('Invalid Cloudflare ' + key)
  }
  return { domain, cloudflare, resend }
}

// 目标地址必须先验证；重复执行不覆盖已有规则和第三方 MX。
export async function provisionEmailRouting(api, accountId, zoneId, domain, source, destination, apply, log = () => {}) {
  const addrPath = '/accounts/' + accountId + '/email/routing/addresses'
  const rulePath = '/zones/' + zoneId + '/email/routing/rules'
  const addresses = await cloudflarePages(api, addrPath)
  const matches = addresses.filter((a) => a.email?.toLowerCase() === destination.toLowerCase())
  let target = onlyOne(matches, '邮件转发目标地址')
  if (!target) {
    if (!apply) throw new Error('邮件转发目标地址尚未创建')
    target = await api('POST', addrPath, { email: destination })
  }
  if (!target.verified) return 'pending'
  log('邮件转发目标地址已验证')
  const rules = await cloudflarePages(api, rulePath)
  const hits = rules.filter((r) => r.matchers?.some((m) => m.type === 'literal' && m.field === 'to' && m.value?.toLowerCase() === source.toLowerCase()))
  const rule = onlyOne(hits, '邮件转发规则')
  if (rule && (!rule.enabled || rule.matchers?.length !== 1 || rule.actions?.length !== 1 || rule.actions[0].type !== 'forward' || rule.actions[0].value?.length !== 1 || rule.actions[0].value[0].toLowerCase() !== destination.toLowerCase())) {
    throw new Error('邮件转发规则与现有规则冲突，请在 Cloudflare 核对')
  }
  if (!rule) {
    if (!apply) throw new Error('邮件转发规则尚未创建')
    await api('POST', rulePath, { name: '转发 ' + source, enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: source }],
      actions: [{ type: 'forward', value: [destination] }] })
  }
  log('邮件转发规则已验证')
  const settingsPath = '/zones/' + zoneId + '/email/routing'
  const settings = await api('GET', settingsPath)
  if (!settings.enabled || settings.status !== 'ready') {
    if (!apply) throw new Error('Cloudflare 邮件路由尚未就绪')
    const mx = await cloudflarePages(api, '/zones/' + zoneId + '/dns_records?type=MX&name=' + encodeURIComponent(domain))
    if (mx.some((r) => !String(r.content ?? '').toLowerCase().replace(/\.$/, '').endsWith('.mx.cloudflare.net'))) {
      throw new Error('域名已有其他邮件服务商的 MX 记录，拒绝自动更改')
    }
    await api('POST', settingsPath + '/dns', {})
  }
  const verified = await api('GET', settingsPath)
  if (!verified.enabled || verified.status !== 'ready') throw new Error('Cloudflare 邮件路由尚未就绪，请检查 DNS')
  return 'ready'
}

// 查找站点或父域 Zone；仅在 apply 时为确定的账号创建缺失 Zone。
export async function discoverCloudflareIds(api, domain, configured, apply = false) {
  if (!api) throw new Error('Cloudflare token required to discover accountId/zoneId')
  if (configured.zoneId && apply) {
    // 仅在确认旧 Zone 属于其他域名时清理；不可访问时保留保护。
    const previous = await api('GET', '/zones/' + configured.zoneId)
    const previousName = previous?.name?.toLowerCase()
    if (!previousName || !previous?.account?.id) throw new Error('Configured zoneId could not be verified')
    if (configured.accountId && configured.accountId.toLowerCase() !== previous.account.id.toLowerCase()) throw new Error('Cloudflare accountId conflicts with configured zone')
    if (domain !== previousName && !domain.endsWith('.' + previousName)) {
      const { zoneId, zoneStatus, nameServers, ...rest } = configured
      configured = rest
    }
  }
  const labels = domain.split('.')
  let zone = null
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = labels.slice(i).join('.')
    const rows = await cloudflarePages(api, '/zones?name=' + encodeURIComponent(name))
    zone = onlyOne(rows.filter((row) => row.name?.toLowerCase() === name), 'Cloudflare zone for ' + name)
    if (zone) break
  }
  if (!zone && apply) {
    if (configured.zoneId) throw new Error('Configured zoneId is not visible; refusing to create another zone')
    const accounts = await cloudflarePages(api, '/accounts')
    const account = configured.accountId
      ? onlyOne(accounts.filter((item) => item.id?.toLowerCase() === configured.accountId.toLowerCase()), 'Cloudflare account')
      : onlyOne(accounts, 'Cloudflare account; set platforms.cloudflare.accountId')
    if (!account || !/^[a-f0-9]{32}$/i.test(account.id ?? '')) throw new Error('Cloudflare account not found or inaccessible; check account permissions')
    zone = await api('POST', '/zones', { name: domain, account: { id: account.id }, type: 'full' })
    if (zone?.name?.toLowerCase() !== domain || zone.account?.id?.toLowerCase() !== account.id.toLowerCase()) {
      throw new Error('Created Cloudflare zone does not match the expected domain or account')
    }
  }
  if (!zone) throw new Error('Cloudflare zone not found or inaccessible for ' + domain + '; check domain and token permissions')
  const accountId = zone.account?.id
  if (!/^[a-f0-9]{32}$/i.test(zone.id ?? '') || !/^[a-f0-9]{32}$/i.test(accountId ?? '')) throw new Error('Cloudflare zone returned invalid account or zone ID')
  if (configured.accountId && configured.accountId.toLowerCase() !== accountId.toLowerCase()) throw new Error('Cloudflare accountId conflicts with domain zone')
  if (configured.zoneId && configured.zoneId.toLowerCase() !== zone.id.toLowerCase()) throw new Error('Cloudflare zoneId conflicts with domain zone')
  return { ...configured, accountId, zoneId: zone.id, ...(zone.name_servers?.length ? { nameServers: zone.name_servers } : {}), ...(zone.status ? { zoneStatus: zone.status } : {}) }
}

export function createApiClient(base, token, fetcher = fetch) {
  if (!token || token.length < 12) throw new Error('Missing platform administrator credential')
  return async (method, path, body) => {
    if (!path.startsWith('/') || path.includes('://')) throw new Error('Invalid API path')
    let response
    try {
      response = await fetcher(base + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch { throw new Error('Platform API network request failed') }
    if (!response.ok) {
      let codes = ''
      try { codes = (await response.json()).errors?.map((error) => Number(error.code)).filter(Number.isFinite).join(',') ?? '' } catch {}
      throw new Error('Platform API ' + method + ' failed with HTTP ' + response.status + (codes ? ' (code ' + codes + ')' : ''))
    }
    let data
    try { data = await response.json() }
    catch { throw new Error('Platform API returned invalid JSON') }
    if (data.success === false) throw new Error('Platform API refused the request')
    return data.result ?? data
  }
}

async function cloudflarePages(api, path) {
  const all = []
  for (let page = 1; page < 40; page++) {
    const value = await api('GET', path + (path.includes('?') ? '&' : '?') + 'page=' + page + '&per_page=100')
    const rows = Array.isArray(value) ? value : value.result
    if (!Array.isArray(rows)) throw new Error('Cloudflare resource list is malformed')
    all.push(...rows)
    if (rows.length < 100) return all
  }
  throw new Error('Cloudflare pagination exceeded limits')
}

function onlyOne(rows, label) {
  if (rows.length > 1) throw new Error('Ambiguous ' + label + '; refusing to create or overwrite')
  return rows[0] ?? null
}

export async function provisionTurnstile(api, accountId, domain, apply) {
  const path = '/accounts/' + accountId + '/challenges/widgets'
  const name = 'site-' + domain + '-login'
  const widgets = await cloudflarePages(api, path)
  let target = onlyOne(widgets.filter((w) => w.name === name), 'Turnstile')
  if (target && !target.domains?.includes(domain)) throw new Error('Turnstile widget belongs to a different domain')
  if (!target) {
    if (!apply) throw new Error('Turnstile missing; rerun with --apply')
    target = await api('POST', path, { name, domains: [domain], mode: 'managed' })
  }
  const widget = await api('GET', path + '/' + encodeURIComponent(target.sitekey))
  if (!widget.sitekey || !widget.secret || !widget.domains?.includes(domain)) {
    throw new Error('Turnstile credentials could not be verified')
  }
  return { siteKey: widget.sitekey, secret: widget.secret }
}

export async function provisionAnalytics(api, accountId, domain, apply, oldToken = '') {
  const path = '/accounts/' + accountId + '/rum/site_info'
  const rows = await cloudflarePages(api, path + '/list')
  let site = onlyOne(rows.filter((s) => (oldToken && s.site_token === oldToken)
    || s.host === domain || s.rules?.some((r) => r.host === domain)), 'Web Analytics')
  if (!site) {
    // If the old token was not persisted and remote sites cannot be identified
    // by hostname, creating another may duplicate an earlier partial setup.
    if (rows.some((s) => !s.host && !s.rules?.length)) {
      throw new Error('Some RUM sites lack host metadata; resolve them before creating another')
    }
    if (!apply) throw new Error('Web Analytics site missing; rerun with --apply')
    site = await api('POST', path, { host: domain, auto_install: false })
  }
  if (!site.site_tag || !site.site_token) throw new Error('Web Analytics token missing')
  return { token: site.site_token }
}

export async function provisionResend(api, domain, apply) {
  const result = await api('GET', '/domains?limit=100')
  if (result.has_more === true || result.hasMore === true) {
    throw new Error('Resend domain list is incomplete; resolve pagination before creating')
  }
  const entries = Array.isArray(result.data) ? result.data : []
  let item = onlyOne(entries.filter((row) => row.name === domain), 'Resend domain')
  if (!item) {
    if (!apply) throw new Error('Resend domain missing; rerun with --apply')
    item = await api('POST', '/domains', { name: domain })
  }
  if (!item.id) throw new Error('Resend domain ID missing')
  const details = await api('GET', '/domains/' + encodeURIComponent(item.id))
  return { id: item.id, records: details.records ?? [], status: details.status ?? 'pending' }
}

export function dnsEntries(records, domain, allowMx) {
  if (!Array.isArray(records)) throw new Error('Invalid Resend DNS records')
  return records.map((r) => {
    if (!['TXT', 'CNAME', 'MX'].includes(r.type)) throw new Error('Unsupported DNS record')
    if (r.type === 'MX' && !allowMx) throw new Error('MX change needs allowMx: true')
    let name = String(r.name ?? '').toLowerCase().replace(/\.$/, '')
    if (name !== domain && !name.endsWith('.' + domain)) name += '.' + domain
    if (name !== domain && !name.endsWith('.' + domain)) throw new Error('Out-of-zone DNS record')
    const content = String(r.value ?? '').trim()
    if (!content || content.length > 2048) throw new Error('Invalid DNS record content')
    return { type: r.type, name, content, ttl: 1,
      ...(r.type === 'MX' ? { priority: Number(r.priority) || 10 } : {}) }
  })
}

export async function provisionDns(api, zoneId, records, domain, apply, allowMx) {
  for (const item of dnsEntries(records, domain, allowMx)) {
    const path = '/zones/' + zoneId + '/dns_records'
    const result = await api('GET', path + '?type=' + item.type + '&name=' + encodeURIComponent(item.name))
    const existing = Array.isArray(result) ? result : (result.result ?? [])
    if (existing.some((r) => r.content === item.content && (item.type !== 'MX' || r.priority === item.priority))) continue
    if (existing.length) throw new Error('Existing DNS record conflicts: ' + item.name)
    if (!apply) throw new Error('Resend DNS not configured; rerun with --apply')
    await api('POST', path, item)
  }
}

export function setSiteValues(wrangler, siteCode, turnstile, analytics) {
  let newWrangler = wrangler, newSite = siteCode
  if (turnstile) {
    const pattern = /("TURNSTILE_SITE_KEY":\s*)"[^"]*"/g
    if ([...wrangler.matchAll(pattern)].length !== 1) throw new Error('TURNSTILE_SITE_KEY field missing')
    const old = wrangler.match(/"TURNSTILE_SITE_KEY":\s*"([^"]*)"/)?.[1]
    if (old && old !== '你的站点密钥' && old !== turnstile.siteKey) throw new Error('Turnstile key conflicts with current config')
    newWrangler = wrangler.replace(pattern, (_, key) => key + JSON.stringify(turnstile.siteKey))
  }
  if (analytics) {
    const pattern = /(cfBeaconToken:\s*)'[^']*'/g
    if ([...siteCode.matchAll(pattern)].length !== 1) throw new Error('cfBeaconToken field missing')
    const old = siteCode.match(/cfBeaconToken:\s*'([^']*)'/)?.[1]
    if (old && old !== analytics.token) throw new Error('Analytics token conflicts with current config')
    newSite = siteCode.replace(pattern, (_, key) => key + "'" + analytics.token + "'")
  }
  return { wrangler: newWrangler, siteCode: newSite }
}

export function setRuntimeSecret(source, key, value) {
  if (!/^[A-Z0-9_]+$/.test(key) || !value || /[\r\n]/.test(value)) throw new Error('Invalid runtime secret field')
  const regex = new RegExp('^' + key + '=(.*)$', 'm')
  const existing = source.match(regex)?.[1] ?? ''
  if (existing && existing !== value) throw new Error(key + ' has a different local value; refusing overwrite')
  return regex.test(source) ? source.replace(regex, key + '=' + value) : source.trimEnd() + '\n' + key + '=' + value + '\n'
}

export async function runProvisioning({ setup, current, apply, cf, turnstileCf = cf, resend, log, saveSecrets = /** @type {(value: string) => void} */ (() => {}) }) {
  const { domain, cloudflare, resend: email } = platformConfig(setup)
  let turnstile = null, analytics = null, resendData = null
  let secrets = current.secrets
  if (setup.email?.routing?.enabled) {
    if (!cf) throw new Error('Cloudflare administrator token required')
    const routing = setup.email.routing
    if (apply && cloudflare.zoneStatus === 'pending') {
      log('EMAIL_ROUTING_DEFERRED=Zone 尚未激活，邮件路由将在域名切换后配置')
    } else {
      let state
      try {
        state = await provisionEmailRouting(cf, cloudflare.accountId, cloudflare.zoneId, domain, routing.source || setup.site.adminEmail, routing.destination, apply, log)
      } catch (error) {
        throw new Error('配置 Cloudflare 邮件路由失败：' + (error instanceof Error ? error.message : '未知错误'))
      }
      log(state === 'pending' ? 'EMAIL_ROUTING_PENDING=请在目标邮箱验证 Cloudflare 邮件，然后重新运行 npm run setup -- --apply' : 'EMAIL_ROUTING_READY=邮件转发规则和 Cloudflare 路由已就绪')
    }
  }
  if (cloudflare.turnstile) {
    if (!cf) throw new Error('Cloudflare administrator token required')
    try {
      turnstile = await provisionTurnstile(turnstileCf, cloudflare.accountId, domain, apply)
    } catch (error) {
      throw new Error('配置 Turnstile 失败：' + (error instanceof Error ? error.message : '未知错误') + '；请检查用户级 API Token 的 Turnstile 权限')
    }
    // 在创建其他平台资源前验证公开配置，避免后续才发现不可覆盖的冲突。
    setSiteValues(current.wrangler, current.siteCode, turnstile, null)
    secrets = setRuntimeSecret(secrets, 'TURNSTILE_SECRET_KEY', turnstile.secret)
    if (apply) saveSecrets(secrets)
    log('Turnstile: verified')
  }
  if (cloudflare.analytics) {
    if (!cf) throw new Error('Cloudflare administrator token required')
    const old = current.siteCode.match(/cfBeaconToken:\s*'([^']*)'/)?.[1] ?? ''
    analytics = await provisionAnalytics(cf, cloudflare.accountId, domain, apply, old)
    log('Web Analytics: verified')
  }
  if (email.enabled) {
    if (!resend) throw new Error('Resend administrator token required')
    resendData = await provisionResend(resend, domain, apply)
    log('Resend domain: ' + resendData.status)
    if (email.dns) {
      if (!cf) throw new Error('Cloudflare token needed for DNS')
      await provisionDns(cf, cloudflare.zoneId, resendData.records, domain, apply, Boolean(email.allowMx))
      log('Resend DNS: verified')
      if (apply) await resend('POST', '/domains/' + encodeURIComponent(resendData.id) + '/verify')
    }
    if (email.createSendingKey && !secrets.match(/^RESEND_API_KEY=\S+/m)) {
      const keys = await resend('GET', '/api-keys')
      const baseName = 'site-' + domain
      const existing = keys.data?.some((key) => key.name === baseName || key.name?.startsWith(baseName + '-recovery-'))
      if (!apply) throw new Error('Resend sending key missing; rerun with --apply')
      const key = await resend('POST', '/api-keys', {
        name: existing ? baseName + '-recovery-' + randomUUID().slice(0, 8) : baseName,
        permission: 'sending_access', domain_id: resendData.id,
      })
      if (!key.token) throw new Error('Resend did not return a sending token')
      secrets = setRuntimeSecret(secrets, 'RESEND_API_KEY', key.token)
      saveSecrets(secrets)
      if (existing) log('Resend 旧密钥值无法读取，已创建新的发送密钥；旧密钥未删除')
      log('Resend site-restricted sending key: created')
    }
  }
  return { ...setSiteValues(current.wrangler, current.siteCode, turnstile, analytics), secrets }
}

function loadPlatformEnv(path) {
  if (path !== '.dev.vars.platform' || !existsSync(path)) throw new Error('Create local .dev.vars.platform')
  const parsed = parseDotenv(readFileSync(path, 'utf8'))
  if (parsed.errors.length) throw new Error('Invalid platform credentials file')
  return Object.fromEntries(parsed.entries)
}

export async function main(args = process.argv.slice(2), overrides = {}) {
  const log = overrides.log ?? console.log
  try {
    const mode = platformOptions(args)
    const read = overrides.read ?? readFileSync
    const argValue = (key, fallback) => { const i = args.indexOf(key); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback }
    const setupFile = argValue('--config', 'site.setup.json')
    const wranglerFile = argValue('--wrangler', 'wrangler.jsonc')
    const setupText = read(setupFile, 'utf8')
    const setup = JSON.parse(setupText)
    let { cloudflare, resend, domain } = platformConfig(setup)
    if (mode === '--plan') {
      log('V2 plan only, no network or write: Turnstile=' + Boolean(cloudflare.turnstile)
        + ' Analytics=' + Boolean(cloudflare.analytics) + ' Resend=' + Boolean(resend.enabled))
      return 0
    }
    const vars = overrides.vars ?? loadPlatformEnv('.dev.vars.platform')
    const cf = vars.CLOUDFLARE_API_TOKEN ? createApiClient('https://api.cloudflare.com/client/v4', vars.CLOUDFLARE_API_TOKEN, overrides.fetcher) : null
    const turnstileCf = vars.CLOUDFLARE_USER_API_TOKEN ? createApiClient('https://api.cloudflare.com/client/v4', vars.CLOUDFLARE_USER_API_TOKEN, overrides.fetcher) : cf
    const email = vars.RESEND_ADMIN_API_KEY ? createApiClient('https://api.resend.com', vars.RESEND_ADMIN_API_KEY, overrides.fetcher) : null
    {
      cloudflare = await discoverCloudflareIds(cf, domain, cloudflare, mode === '--apply')
      setup.platforms ??= {}
      setup.platforms.cloudflare = cloudflare
      log('Cloudflare account and zone discovered for ' + domain)
      if (cloudflare.zoneStatus) log('CLOUDFLARE_ZONE_STATUS=' + cloudflare.zoneStatus)
      if (cloudflare.zoneStatus !== 'active' && cloudflare.nameServers?.length) {
        log('CLOUDFLARE_NAMESERVERS=' + cloudflare.nameServers.join(','))
        log('Zone 尚未激活；检查并迁移现有 DNS 记录后，在域名注册商更新 nameserver。')
      }
      if (mode === '--apply' && JSON.stringify(JSON.parse(setupText)) !== JSON.stringify(setup)) {
        const write = overrides.write ?? writeFileSync
        write(setupFile, JSON.stringify(setup, null, 2) + '\n')
      }
    }
    const secretsFile = setup.secrets?.file || '.dev.vars.production'
    if (!/^\.dev\.vars\.[A-Za-z0-9_-]+$/.test(secretsFile) || secretsFile === '.dev.vars.platform') throw new Error('Invalid runtime secrets file')
    const current = {
      wrangler: read(wranglerFile, 'utf8'),
      siteCode: read('src/config/site.ts', 'utf8'),
      secrets: read(secretsFile, 'utf8'),
    }
    const write = overrides.write ?? writeFileSync
    const result = await runProvisioning({ setup, current, apply: mode === '--apply', cf, turnstileCf, resend: email, log,
      saveSecrets: (value) => write(secretsFile, value, { mode: 0o600 }) })
    if (mode === '--apply') {
      if (result.wrangler !== current.wrangler) write(wranglerFile, result.wrangler)
      if (result.siteCode !== current.siteCode) write('src/config/site.ts', result.siteCode)
    }
    log('Completed; no Worker deployment performed.')
    return 0
  } catch (error) {
    log('✗ ' + (error instanceof Error ? error.message : 'Unexpected failure'))
    return 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((result) => { process.exitCode = result })
}
