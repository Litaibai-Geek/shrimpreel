import { describe, expect, it } from 'vitest'
import { ensureWwwRedirect, redirectRule } from '../../scripts/setup-www-redirect.mjs'

const domain = 'example.com'
const zone = 'zone-id'

describe('www 重定向初始化', () => {
  it('创建 DNS 和 308 规则，并保留路径及查询参数', async () => {
    const calls: Array<{ method: string; path: string; body?: any }> = []
    const api = async (method: string, path: string, body?: any): Promise<any> => {
      calls.push({ method, path, body })
      if (method === 'GET' && path.includes('dns_records')) return []
      if (method === 'GET') throw Object.assign(new Error('missing'), { status: 404 })
      return {}
    }
    expect(await ensureWwwRedirect(api, zone, domain)).toBe('created')
    expect(calls.find((call) => call.path.endsWith('/dns_records'))?.body).toMatchObject({ type: 'CNAME', name: 'www.example.com', content: domain, proxied: true })
    const rule = calls.find((call) => call.path.endsWith('/rulesets'))?.body.rules[0]
    expect(rule).toEqual(redirectRule(domain))
    expect(rule.action_parameters.from_value).toMatchObject({ status_code: 308, preserve_query_string: true })
  })

  it('重复执行复用既有规则，追加规则时不覆盖其他规则', async () => {
    const calls: Array<{ method: string; path: string }> = []
    let rules: any[] = [redirectRule(domain)]
    const api = async (method: string, path: string): Promise<any> => {
      calls.push({ method, path })
      if (method === 'GET' && path.includes('dns_records')) return [{ type: 'CNAME', proxied: true }]
      if (method === 'GET') return { id: 'ruleset-id', rules }
      return {}
    }
    expect(await ensureWwwRedirect(api, zone, domain)).toBe('existing')
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
    rules = [{ ref: 'other', expression: '(http.host eq "shop.example.com")' }]
    expect(await ensureWwwRedirect(api, zone, domain)).toBe('created')
    expect(calls.at(-1)?.path).toBe('/zones/zone-id/rulesets/ruleset-id/rules')
  })

  it('发现不一致的规则或未代理的 DNS 时拒绝覆盖', async () => {
    const api = async (_method: string, path: string): Promise<any> => path.includes('dns_records') ? [{ type: 'A', proxied: true }] : { id: 'ruleset', rules: [{ ...redirectRule(domain), enabled: false }] }
    await expect(ensureWwwRedirect(api, zone, domain)).rejects.toThrow('未覆盖')
    await expect(ensureWwwRedirect(async () => [{ type: 'A', proxied: false }], zone, domain)).rejects.toThrow('未启用代理')
  })
})
