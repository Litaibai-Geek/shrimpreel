import { describe, expect, it } from 'vitest'
import {
  main, platformOptions, platformConfig, provisionTurnstile, provisionAnalytics,
  dnsEntries, setRuntimeSecret, discoverCloudflareIds,
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
    expect(writes).toEqual(['.dev.vars.staging', 'custom-wrangler.jsonc', 'custom.json'])
    expect(JSON.parse(files['custom.json']!).platforms.cloudflare).toMatchObject({ accountId: id, zoneId: 'b'.repeat(32) })
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
})
