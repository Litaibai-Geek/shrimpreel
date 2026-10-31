#!/usr/bin/env node
// V2 platform provisioning: explicit dry-run/apply/verify; never deploys.
// Platform admin credentials stay local, not inside site Workers.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseDotenv } from './sync-secrets.mjs'

export function platformOptions(args) {
  const modes = ['--plan', '--apply', '--verify'].filter((x) => args.includes(x))
  if (modes.length > 1) throw new Error('Choose only one mode: --plan, --apply, --verify')
  return modes[0] ?? '--plan'
}

export function platformConfig(setup) {
  const domain = setup?.site?.domain
  if (typeof domain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    throw new Error('Invalid site domain')
  }
  const cloudflare = setup.platforms?.cloudflare ?? {}
  const resend = setup.platforms?.resend ?? {}
  if ((cloudflare.turnstile || cloudflare.analytics) && !/^[a-f0-9]{32}$/i.test(cloudflare.accountId ?? '')) {
    throw new Error('Cloudflare accountId (32 hex) is required')
  }
  if (resend.enabled && resend.dns && !/^[a-f0-9]{32}$/i.test(cloudflare.zoneId ?? '')) {
    throw new Error('Cloudflare zoneId is required for Resend DNS')
  }
  return { domain, cloudflare, resend }
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
    if (!response.ok) throw new Error('Platform API ' + method + ' failed with HTTP ' + response.status)
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
    if (old && old !== turnstile.siteKey) throw new Error('Turnstile key conflicts with current config')
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

export async function runProvisioning({ setup, current, apply, cf, resend, log }) {
  const { domain, cloudflare, resend: email } = platformConfig(setup)
  let turnstile = null, analytics = null, resendData = null
  let secrets = current.secrets
  if (cloudflare.turnstile) {
    if (!cf) throw new Error('Cloudflare administrator token required')
    turnstile = await provisionTurnstile(cf, cloudflare.accountId, domain, apply)
    secrets = setRuntimeSecret(secrets, 'TURNSTILE_SECRET_KEY', turnstile.secret)
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
      if (keys.data?.some((key) => key.name === 'site-' + domain)) {
        throw new Error('Resend sending key already exists; manually reconcile the unrecoverable token')
      }
      if (!apply) throw new Error('Resend sending key missing; rerun with --apply')
      const key = await resend('POST', '/api-keys', {
        name: 'site-' + domain, permission: 'sending_access', domain_id: resendData.id,
      })
      if (!key.token) throw new Error('Resend did not return a sending token')
      secrets = setRuntimeSecret(secrets, 'RESEND_API_KEY', key.token)
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
    const setup = JSON.parse(read('site.setup.json', 'utf8'))
    const { cloudflare, resend } = platformConfig(setup)
    if (mode === '--plan') {
      log('V2 plan only, no network or write: Turnstile=' + Boolean(cloudflare.turnstile)
        + ' Analytics=' + Boolean(cloudflare.analytics) + ' Resend=' + Boolean(resend.enabled))
      return 0
    }
    const vars = overrides.vars ?? loadPlatformEnv('.dev.vars.platform')
    const cf = vars.CLOUDFLARE_API_TOKEN ? createApiClient('https://api.cloudflare.com/client/v4', vars.CLOUDFLARE_API_TOKEN, overrides.fetcher) : null
    const email = vars.RESEND_ADMIN_API_KEY ? createApiClient('https://api.resend.com', vars.RESEND_ADMIN_API_KEY, overrides.fetcher) : null
    const current = {
      wrangler: read('wrangler.jsonc', 'utf8'),
      siteCode: read('src/config/site.ts', 'utf8'),
      secrets: read('.dev.vars.production', 'utf8'),
    }
    const result = await runProvisioning({ setup, current, apply: mode === '--apply', cf, resend: email, log })
    if (mode === '--apply') {
      const write = overrides.write ?? writeFileSync
      if (result.secrets !== current.secrets) write('.dev.vars.production', result.secrets, { mode: 0o600 })
      if (result.wrangler !== current.wrangler) write('wrangler.jsonc', result.wrangler)
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
