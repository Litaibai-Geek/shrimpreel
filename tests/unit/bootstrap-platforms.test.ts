import { describe, expect, it } from 'vitest'
import {
  main, platformOptions, platformConfig, provisionTurnstile, provisionAnalytics,
  dnsEntries, setRuntimeSecret,
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
    expect(() => platformConfig({ site: setup.site, platforms: { cloudflare: { turnstile: true } } })).toThrow('accountId')
    expect(() => platformConfig({ site: setup.site, platforms: { resend: { enabled: true, dns: true } } })).toThrow('zoneId')
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
