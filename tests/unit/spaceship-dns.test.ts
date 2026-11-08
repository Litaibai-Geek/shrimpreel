import { afterEach, describe, expect, it, vi } from 'vitest'
import { autoUpdateAndWaitForDNS, checkNameserversPropagation, getCurrentNameservers } from '../../scripts/spaceship-dns.mjs'

afterEach(() => vi.unstubAllGlobals())

describe('Spaceship DNS 初始化', () => {
  it('不能把不同解析器返回的部分记录合并为成功', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ Answer: [{ type: 2, data: ++calls === 1 ? 'one.example.com' : 'two.example.com' }] }) })))
    const result = await checkNameserversPropagation('example.com', ['one.example.com', 'two.example.com'], async () => [])
    expect(result.propagated).toBe(false)
  })
  it('公共 DNS 接口不可用时使用系统 DNS 查询', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable') }))
    const result = await checkNameserversPropagation('example.com', ['one.example.com', 'two.example.com'], async () => ['TWO.example.com.', 'one.example.com'])
    expect(result.propagated).toBe(true)
    expect(result.current).toHaveLength(2)
  })

  it('注册商已配置目标 nameserver 时等待传播，不重复修改', async () => {
    const target = ['one.ns.cloudflare.com', 'two.ns.cloudflare.com']
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => url.includes('/domains/')
      ? { nameservers: { provider: 'custom', hosts: target } } : { Answer: [{ type: 2, data: 'old.example.com' }] } }))
    vi.stubGlobal('fetch', fetcher)
    const logs: string[] = []
    expect(await autoUpdateAndWaitForDNS('example.com', target, 'key', 'secret', (line: string) => logs.push(line), 0, 0)).toBe(false)
    expect(logs.join('\n')).toContain('注册商已配置目标 nameserver')
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
  })
  it('从域名信息接口读取 nameserver', async () => {
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => ({ nameservers: { hosts: ['ns.example.com'] } }) }))
    vi.stubGlobal('fetch', fetcher)
    expect(await getCurrentNameservers('example.com', 'key', 'secret')).toEqual(['ns.example.com'])
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://spaceship.dev/api/v1/domains/example.com')
  })

  it('存在旧 DNS 记录时拒绝切换 nameserver', async () => {
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) => ({ ok: true, status: 200, json: async () => url.includes('dns-query') || url.includes('dns.google')
      ? { Answer: [{ data: 'old.example.com' }] }
      : url.includes('/dns/records/') ? { items: [{}], total: 1 } : { nameservers: { provider: 'basic' } } }))
    vi.stubGlobal('fetch', fetcher)
    const logs: string[] = []
    expect(await autoUpdateAndWaitForDNS('example.com', ['one.ns.cloudflare.com', 'two.ns.cloudflare.com'], 'key', 'secret', (line: string) => logs.push(line), 0, 0)).toBe(false)
    expect(logs.join('\n')).toContain('现有 DNS 包含记录')
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
  })
})
