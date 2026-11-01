import { describe, expect, it } from 'vitest'
import {
  main, platformOptions, platformConfig, provisionTurnstile, provisionAnalytics,
  dnsEntries, setRuntimeSecret, discoverCloudflareIds, runProvisioning,
} from '../../scripts/bootstrap-platforms.mjs'

const id = 'a'.repeat(32)
const setup = { site: { domain: 'tinydeskai.website' },
  platforms: { cloudflare: { accountId: id, turnstile: true, analytics: true } } }

describe('platform bootstrap V2', () => {
  it('defaults to fully offline preview', async () => {
    const called: string[] = []
    const result = await main([], { read: (name: string) => {
      called.push(name)
      if (name === 'site.setup.json') return JSON.stringify(setup)
      throw new Error('Must not access other files')
    }, log: () => {}, fetcher: () => { throw new Error('Must not call API') } })
    expect(result).toBe(0)
    expect(called).toEqual(['site.setup.json'])
    expect(platformOptions(['--verify'])).toBe('--verify')
    expect(() => platformOptions(['--plan', '--apply'])).toThrow()
  })

  it('validates account and zone ID', () => {
    expect(() => platformConfig({ site: setup.site, platforms: { cloudflare: { accountId: 'invalid' } } })).toThrow('accountId')
    expect(() => platformConfig({ site: setup.site, platforms: { cloudflare: { zoneId: 'invalid' } } })).toThrow('zoneId')
    expect(platformConfig({ site: setup.site, platforms: { cloudflare: { turnstile: true } } }).cloudflare.accountId).toBeUndefined()
  })

  it('discovers the parent zone and account, and rejects conflicts or ambiguity', async () => {
    const zone = { name: 'tinydeskai.website', id: 'b'.repeat(32), account: { id } }
    const api = async (_method: string, path: string) => path.includes('name=tinydeskai.website') ? [zone] : []
    expect(await discoverCloudflareIds(api, 'app.tinydeskai.website', {})).toMatchObject({ accountId: id, zoneId: zone.id })
    await expect(discoverCloudflareIds(api, 'tinydeskai.website', { accountId: 'c'.repeat(32) })).rejects.toThrow('conflicts')
    await expect(discoverCloudflareIds(async () => [zone, zone], 'tinydeskai.website', {})).rejects.toThrow('Ambiguous')
    await expect(discoverCloudflareIds(async () => [], 'tinydeskai.website', {})).rejects.toThrow('not found or inaccessible')
    await expect(discoverCloudflareIds(null, 'tinydeskai.website', {})).rejects.toThrow('token required')
  })

  it('persists discovered IDs only after an apply, using the selected files', async () => {
    const configured = { site: setup.site, secrets: { file: '.dev.vars.staging' },
      platforms: { cloudflare: { turnstile: true } } }
    const files: Record<string, string> = {
      'custom.json': JSON.stringify(configured), 'custom-wrangler.jsonc': '{"TURNSTILE_SITE_KEY": ""}',
      'src/config/site.ts': "cfBeaconToken: ''", '.dev.vars.staging': 'TURNSTILE_SECRET_KEY=\n',
    }
    const writes: string[] = []
    const fetcher = async (url: string) => {
      const result = url.includes('/zones?') ? [{ name: setup.site.domain, id: 'b'.repeat(32), account: { id } }]
        : url.includes('?page=') ? [{ name: 'site-' + setup.site.domain + '-login', domains: [setup.site.domain], sitekey: 'sitekey' }]
        : { domains: [setup.site.domain], sitekey: 'sitekey', secret: 'secret' }
      return { ok: true, json: async () => ({ success: true, result }) }
    }
    const deps = { read: (name: string) => files[name], vars: { CLOUDFLARE_API_TOKEN: 'valid-token-value' }, fetcher,
      write: (name: string, value: string) => { writes.push(name); files[name] = value }, log: () => {} }
    expect(await main(['--verify', '--config', 'custom.json', '--wrangler', 'custom-wrangler.jsonc'], deps)).toBe(0)
    expect(writes).toEqual([])
    expect(await main(['--apply', '--config', 'custom.json', '--wrangler', 'custom-wrangler.jsonc'], deps)).toBe(0)
    expect(writes).toEqual(['custom.json', '.dev.vars.staging', 'custom-wrangler.jsonc'])
    expect(JSON.parse(files['custom.json']!).platforms.cloudflare).toMatchObject({ accountId: id, zoneId: 'b'.repeat(32) })
  })

  it('只在 apply 为唯一账号创建缺失域名，verify 不创建且重试复用', async () => {
    let existing: any = null
    let creates = 0
    const api = async (method: string, path: string, body?: any) => {
      if (method === 'GET' && path.startsWith('/zones?')) return existing ? [existing] : []
      if (method === 'GET' && path.startsWith('/accounts?')) return [{ id }]
      if (method === 'POST' && path === '/zones') {
        creates++
        existing = { name: body.name, id: 'b'.repeat(32), account: body.account, status: 'pending', name_servers: ['one.ns.cloudflare.com', 'two.ns.cloudflare.com'] }
        return existing
      }
      throw new Error('unexpected request')
    }
    await expect(discoverCloudflareIds(api, setup.site.domain, {}, false)).rejects.toThrow('not found or inaccessible')
    const created = await discoverCloudflareIds(api, setup.site.domain, {}, true)
    expect(created).toMatchObject({ accountId: id, zoneId: 'b'.repeat(32), zoneStatus: 'pending' })
    expect(created.nameServers).toHaveLength(2)
    await discoverCloudflareIds(api, setup.site.domain, created, true)
    expect(creates).toBe(1)
    await expect(discoverCloudflareIds(async (_m: string, p: string) => p.startsWith('/accounts?') ? [{ id }, { id: 'c'.repeat(32) }] : [], setup.site.domain, {}, true)).rejects.toThrow('Ambiguous')
    await expect(discoverCloudflareIds(api, 'another.example', { zoneId: 'c'.repeat(32) }, true)).rejects.toThrow()
  })

  it('Zone 创建后即使后续步骤失败，也保留 ID 并输出分配的 nameserver', async () => {
    const configured = { site: setup.site, secrets: { file: '.dev.vars.production' }, platforms: { cloudflare: { turnstile: true } } }
    const files: Record<string, string> = { 'site.setup.json': JSON.stringify(configured), 'wrangler.jsonc': '{"vars":{"TURNSTILE_SITE_KEY":""}}', 'src/config/site.ts': "cfBeaconToken: ''", '.dev.vars.production': '' }
    const logs: string[] = []
    const fetcher = async (url: string, options: { method: string }) => {
      if (url.includes('/zones?')) return { ok: true, json: async () => ({ result: [] }) }
      if (url.includes('/accounts?')) return { ok: true, json: async () => ({ result: [{ id }] }) }
      if (url.endsWith('/zones') && options.method === 'POST') return { ok: true, json: async () => ({ result: { name: setup.site.domain, id: 'b'.repeat(32), account: { id }, status: 'pending', name_servers: ['one.ns.cloudflare.com', 'two.ns.cloudflare.com'] } }) }
      return { ok: false, status: 403 }
    }
    const code = await main(['--apply'], { read: (name: string) => files[name], write: (name: string, value: string) => { files[name] = value }, vars: { CLOUDFLARE_API_TOKEN: 'valid-token-value' }, fetcher, log: (line: string) => logs.push(line) })
    expect(code).toBe(1)
    expect(JSON.parse(files['site.setup.json']!).platforms.cloudflare.zoneId).toBe('b'.repeat(32))
    expect(logs.join('\n')).toContain('CLOUDFLARE_NAMESERVERS=one.ns.cloudflare.com,two.ns.cloudflare.com')
  })

  it('reuses already existing Turnstile widget after first creation', async () => {
    let widget: any = null
    let creates = 0
    const api = async (method: string, path: string, body?: any): Promise<any> => {
      if (method === 'GET' && path.includes('page=')) return widget ? [widget] : []
      if (method === 'POST') { creates++; widget = { sitekey: 'sitekey', name: body.name, domains: [setup.site.domain] }; return widget }
      return { ...widget, secret: 'secret' }
    }
    await provisionTurnstile(api, id, setup.site.domain, true)
    await provisionTurnstile(api, id, setup.site.domain, true)
    expect(creates).toBe(1)
  })

  it('reuses Web Analytics and blocks mismatched secrets or DNS MX edits', async () => {
    const api = async () => [{ site_tag: 'tag', site_token: 'token', rules: [{ host: setup.site.domain }] }]
    expect((await provisionAnalytics(api, id, setup.site.domain, false)).token).toBe('token')
    expect(() => setRuntimeSecret('RESEND_API_KEY=old', 'RESEND_API_KEY', 'new')).toThrow('different')
    expect(() => dnsEntries([{ type: 'MX', name: 'send', value: 'mx.example.net' }], setup.site.domain, false))
      .toThrow('allowMx')
  })

  it('已有同名 Resend 密钥但本地无值时创建新密钥并立即保存，保留旧密钥', async () => {
    const configured = { site: setup.site, platforms: { cloudflare: { accountId: id, turnstile: true }, resend: { enabled: true, createSendingKey: true } } }
    const saved: string[] = [], calls: { method: string; path: string; body?: any }[] = [], logs: string[] = []
    const cf = async (_method: string, path: string) => path.includes('?page=')
      ? [{ name: 'site-' + setup.site.domain + '-login', domains: [setup.site.domain], sitekey: 'sitekey' }]
      : { domains: [setup.site.domain], sitekey: 'sitekey', secret: 'turnstile-secret' }
    const resend = async (method: string, path: string, body?: any) => {
      calls.push({ method, path, body })
      if (path.startsWith('/domains?')) return { data: [{ id: 'domain-id', name: setup.site.domain }] }
      if (path === '/domains/domain-id') return { status: 'pending', records: [] }
      if (path === '/api-keys' && method === 'GET') return { data: [{ name: 'site-' + setup.site.domain }] }
      if (path === '/api-keys' && method === 'POST') return { token: 'replacement-secret' }
      throw new Error('unexpected request')
    }
    const current = { wrangler: '{"TURNSTILE_SITE_KEY": "你的站点密钥"}', siteCode: '', secrets: 'TURNSTILE_SECRET_KEY=\nRESEND_API_KEY=\n' }
    const result = await runProvisioning({ setup: configured, current, apply: true, cf, resend, log: (line: string) => logs.push(line), saveSecrets: (value: string) => saved.push(value) })
    expect(saved).toHaveLength(2)
    expect(saved[1]).toContain('RESEND_API_KEY=replacement-secret')
    expect(result.wrangler).toContain('"TURNSTILE_SITE_KEY": "sitekey"')
    expect(calls.find((call) => call.method === 'POST')?.body.name).toMatch(/^site-tinydeskai\.website-recovery-/)
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false)
    expect(logs.join('\n')).not.toContain('replacement-secret')
  })
})
