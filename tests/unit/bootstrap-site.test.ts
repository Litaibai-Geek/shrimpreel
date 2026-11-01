import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  ensureCloudflare, main, parseList, patchPublicVars, planDescription,
  updatePublicVar, updateResourceId, validateSetup, normalizeSetup,
} from '../../scripts/bootstrap-site.mjs'
import { checkPublicConfig } from '../../scripts/pre-deploy.mjs'

// 测试独立于本机已创建的生产资源 ID。
const raw = updatePublicVar(updateResourceId(updateResourceId(readFileSync('wrangler.jsonc', 'utf8').replace(/("name"\s*:\s*)"[^"]+"/, '$1"tinydeskai"'), 'd1', '00000000-0000-0000-0000-000000000000'), 'kv', '00000000000000000000000000000000'), 'WAFFO_PRODUCTS', '{}')
const { config } = ts.parseConfigFileTextToJson('wrangler.jsonc', raw)
const setup = {
  site: { name: 'tinydeskai', domain: 'tinydeskai.website', adminEmail: 'admin@example.com' },
  google: { clientId: 'test.apps.googleusercontent.com' },
  payment: { provider: 'waffo', environment: 'test', storeId: '', createProducts: false },
  secrets: { sync: false },
}
const d1Id = '11111111-2222-4333-8444-555555555555'
const kvId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function simulatedCloudflare() {
  const state = {
    d1: [] as Array<{ name: string; uuid: string }>,
    kv: [] as Array<{ title: string; id: string }>,
    r2: false,
    queues: new Set<string>(),
    commands: [] as string[],
    denied: false,
    failKvOnce: false,
  }
  const run = (args: string[]) => {
    state.commands.push(args.join(' '))
    if (state.denied) return { ok: false, output: 'unauthorized' }
    if (args[0] === 'd1' && args[1] === 'list') {
      return { ok: true, output: JSON.stringify(state.d1) }
    }
    if (args[0] === 'd1' && args[1] === 'create') {
      state.d1.push({ name: args[2]!, uuid: d1Id })
      return { ok: true, output: 'created' }
    }
    if (args[0] === 'kv' && args[1] === 'namespace' && args[2] === 'list') {
      return { ok: true, output: JSON.stringify(state.kv) }
    }
    if (args[0] === 'kv' && args[1] === 'namespace' && args[2] === 'create') {
      if (state.failKvOnce) {
        state.failKvOnce = false
        return { ok: false, output: 'temporary failure' }
      }
      state.kv.push({ title: args[3]!, id: kvId })
      return { ok: true, output: 'created' }
    }
    if (args[0] === 'r2' && args[1] === 'bucket') {
      if (args[2] === 'info') return state.r2
        ? { ok: true, output: '{"name":"tinydeskai-media"}' }
        : { ok: false, output: '404 bucket not found' }
      if (args[2] === 'create') {
        state.r2 = true
        return { ok: true, output: 'created' }
      }
    }
    if (args[0] === 'queues') {
      if (args[1] === 'info') return state.queues.has(args[2]!)
        ? { ok: true, output: 'queue exists' }
        : { ok: false, output: '404 not found' }
      if (args[1] === 'create') {
        state.queues.add(args[2]!)
        return { ok: true, output: 'created' }
      }
    }
    throw new Error('Unexpected Wrangler invocation: ' + args.join(' '))
  }
  return { state, run }
}

describe('bootstrap-site', () => {
  it('新增或更新公开变量时保留 JSONC 注释和转义值，重复执行保持不变', () => {
    const input = '{\n  "vars": {\n    // 公开配置\n    "WAFFO_PRODUCTS": "{\\"starter\\":\\"old\\"}"\n  }\n}'
    const value = '{"starter":"new","party":"two"}'
    const updated = updatePublicVar(input, 'WAFFO_PRODUCTS', value)
    const inserted = updatePublicVar(updated, 'WAFFO_STORE_ID', 'STO_example')
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', inserted).config.vars).toEqual({ WAFFO_PRODUCTS: value, WAFFO_STORE_ID: 'STO_example' })
    expect(inserted).toContain('// 公开配置')
    expect(updatePublicVar(inserted, 'WAFFO_STORE_ID', 'STO_example')).toBe(inserted)
  })
  it('自动创建商品前补齐映射字段，部署前检查不会覆盖配置', () => {
    const withoutProducts = raw.replace(/\s*"WAFFO_PRODUCTS": "\{\}",/, '')
    const next = patchPublicVars(withoutProducts, { ...setup, payment: { ...setup.payment, createProducts: true } })
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', next).config.vars.WAFFO_PRODUCTS).toBe('{}')
    expect(checkPublicConfig(next, setup)).toEqual([])
    expect(checkPublicConfig(raw, setup)).toContain('GOOGLE_CLIENT_ID')
  })
  it('parses JSON wrapped by Wrangler notices, rejects unknown formats', () => {
    expect(parseList('update notice\n[{"name":"my-db"}]\n')).toEqual([{ name: 'my-db' }])
    expect(() => parseList('cannot connect')).toThrow('JSON list')
  })
  it('blocks wrong Worker and mismatched site domains', () => {
    expect(() => validateSetup({ ...setup, site: { ...setup.site, domain: 'different.ai' } }, config)).toThrow('site.domain differs')
    expect(() => validateSetup({ ...setup, site: { ...setup.site, name: 'different-worker' } }, config)).toThrow('Worker name differs')
  })
  it('derives site identity but still rejects an explicit mismatch', () => {
    const compact = normalizeSetup({ site: { adminEmail: 'admin@example.com' } }, config, 'tinydeskai.website')
    expect(compact.site).toMatchObject({ name: config.name, domain: 'tinydeskai.website' })
    expect(() => validateSetup(normalizeSetup({ site: { domain: 'wrong.example' } }, config), config)).toThrow('site.domain differs')
  })
  it('plans without remote calls, writes, or secrets', async () => {
    const logs: string[] = []
    let remoteCalls = 0
    let writes = 0
    const code = await main([], {
      read: (p: string) => p === 'site.setup.json' ? JSON.stringify(setup) : raw,
      write: () => { writes++ },
      runWrangler: () => { remoteCalls++; throw new Error('no network allowed') },
      log: (message: string) => { logs.push(message) },
    })
    expect(code).toBe(0)
    expect(remoteCalls).toBe(0)
    expect(writes).toBe(0)
    expect(logs.join('\n')).toContain('D1')
    expect(planDescription(setup, config)).toContain('D1 migration: only with --with-migrations; deploy: never')
  })
  it('creates only missing resources and persists verified IDs; reruns are idempotent', async () => {
    const mock = simulatedCloudflare()
    let stored = raw
    const write = (next: string) => { stored = next }
    const first = await ensureCloudflare({
      configText: raw, run: mock.run, apply: true, write, log: () => {},
    })
    expect(first).toBe(stored)
    expect(first).toContain(d1Id)
    expect(first).toContain(kvId)
    expect(mock.state.commands.filter((x) => x.includes('create'))).toHaveLength(5)
    const count = mock.state.commands.filter((x) => x.includes('create')).length
    const second = await ensureCloudflare({
      configText: first, run: mock.run, apply: true, write, log: () => {},
    })
    expect(second).toBe(first)
    expect(mock.state.commands.filter((x) => x.includes('create'))).toHaveLength(count)
  })
  it('fails safely on authentication errors without creating resources', async () => {
    const mock = simulatedCloudflare()
    mock.state.denied = true
    let writes = 0
    await expect(ensureCloudflare({ configText: raw, run: mock.run, apply: true,
      write: () => { writes++ }, log: () => {} })).rejects.toThrow('Cloudflare command failed')
    expect(writes).toBe(0)
    expect(mock.state.commands).toEqual(['d1 list --json'])
  })
  it('recovers from partial D1 creation without duplicating it', async () => {
    const mock = simulatedCloudflare()
    mock.state.failKvOnce = true
    let saved = raw
    await expect(ensureCloudflare({
      configText: saved, run: mock.run, apply: true, write: (v: string) => { saved = v },
      log: () => {},
    })).rejects.toThrow('Cloudflare command failed')
    expect(mock.state.d1).toHaveLength(1)
    expect(saved).toContain(d1Id)
    await ensureCloudflare({
      configText: saved, run: mock.run, apply: true, write: (v: string) => { saved = v },
      log: () => {},
    })
    expect(mock.state.d1).toHaveLength(1)
    expect(saved).toContain(kvId)
  })
  it('does not overwrite a mismatched existing production D1 ID', async () => {
    const mock = simulatedCloudflare()
    mock.state.d1.push({ name: 'tinydeskai', uuid: d1Id })
    const bad = updateResourceId(raw, 'd1', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    await expect(ensureCloudflare({ configText: bad, run: mock.run, apply: true,
      write: () => {}, log: () => {} })).rejects.toThrow('differs from remote database')
  })
  it('Worker 改名后仍复用已绑定的 KV，不创建同名替代资源', async () => {
    const mock = simulatedCloudflare()
    mock.state.d1.push({ name: 'tinydeskai', uuid: d1Id })
    mock.state.kv.push({ title: 'old-worker-kv', id: kvId })
    const existing = updateResourceId(updateResourceId(raw, 'd1', d1Id), 'kv', kvId)
    await ensureCloudflare({ configText: existing, run: mock.run, apply: true, write: () => {}, log: () => {} })
    expect(mock.state.commands.some((command) => command.startsWith('kv namespace create'))).toBe(false)
    expect(mock.state.kv).toHaveLength(1)
  })
  it('已绑定的 KV 不可见时停止而不创建新资源', async () => {
    const mock = simulatedCloudflare()
    mock.state.d1.push({ name: 'tinydeskai', uuid: d1Id })
    const existing = updateResourceId(updateResourceId(raw, 'd1', d1Id), 'kv', kvId)
    await expect(ensureCloudflare({ configText: existing, run: mock.run, apply: true, write: () => {}, log: () => {} })).rejects.toThrow('Configured KV ID is not visible')
    expect(mock.state.commands.some((command) => command.startsWith('kv namespace create'))).toBe(false)
  })
  it('sets public vars without embedding any secrets or removing JSONC comments', () => {
    const updated = patchPublicVars(raw, setup)
    expect(updated).toContain('test.apps.googleusercontent.com')
    expect(updated).toContain('// 新站点')
    expect(updated).not.toContain('GOOGLE_CLIENT_SECRET')
  })
  it('同步并校验视频、审核和发件配置，旧配置缺省时保持原值', () => {
    const configured = { ...setup, video: { provider: 'fal' }, moderation: { provider: 'none' }, email: { from: 'hello@example.org' } }
    const updated = patchPublicVars(raw, configured)
    const vars = ts.parseConfigFileTextToJson('wrangler.jsonc', updated).config.vars
    expect(vars).toMatchObject({ VIDEO_PROVIDER: 'fal', MODERATION_PROVIDER: 'none', EMAIL_FROM: 'hello@example.org' })
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(raw, { ...setup, email: { from: '' } })).config.vars.EMAIL_FROM).toBe('')
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(raw, setup)).config.vars.VIDEO_PROVIDER).toBe(config.vars.VIDEO_PROVIDER)
    expect(() => validateSetup({ ...configured, video: { provider: 'mock' } }, config)).toThrow('video.provider')
    expect(() => validateSetup({ ...configured, moderation: { provider: 'invalid' } }, config)).toThrow('moderation.provider')
    expect(() => validateSetup({ ...configured, email: { from: 'invalid' } }, config)).toThrow('email.from')
  })
  it('邮箱登录目标写入部署配置，旧配置未提供时保持当前值', () => {
    const enabled = { ...setup, email: { from: 'noreply@example.com', loginEnabled: true } }
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(raw, enabled)).config.vars.EMAIL_LOGIN_ENABLED).toBe('true')
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(raw, { ...setup, email: { loginEnabled: false } })).config.vars.EMAIL_LOGIN_ENABLED).toBe('false')
    expect(ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(raw, setup)).config.vars.EMAIL_LOGIN_ENABLED).toBe(config.vars.EMAIL_LOGIN_ENABLED)
    expect(() => validateSetup({ ...setup, email: { loginEnabled: 'true' } }, config)).toThrow('email.loginEnabled')
  })
  it('一次初始化写入正式商品和邮箱登录目标，迁移留给下一步', async () => {
    const mock = simulatedCloudflare()
    const live = { ...setup, email: { from: 'noreply@example.com', loginEnabled: true }, payment: { provider: 'waffo', environment: 'prod', storeId: 'STO_test', createProducts: true } }
    let stored = raw
    const calls: string[][] = []
    const code = await main(['--apply'], {
      exists: () => true,
      read: (p: string) => p === 'site.setup.json' ? JSON.stringify(live) : p === '.dev.vars.production' ? 'WAFFO_MERCHANT_ID=test\nWAFFO_PRIVATE_KEY=test\n' : stored,
      write: (_p: string, value: string) => { stored = value },
      runWrangler: mock.run,
      runNode: (args: string[]) => { calls.push(args); return { ok: true, output: 'WAFFO_PRODUCTS={"starter":"a","party":"b","squad":"c"}\n' } },
      log: () => {},
    })
    expect(code).toBe(0)
    const vars = ts.parseConfigFileTextToJson('wrangler.jsonc', stored).config.vars
    expect(vars.EMAIL_LOGIN_ENABLED).toBe('true')
    expect(JSON.parse(vars.WAFFO_PRODUCTS)).toEqual({ starter: 'a', party: 'b', squad: 'c' })
    expect(calls.find((args) => args[0] === 'scripts/waffo-setup.mjs')).toContain('--prod')
    expect(calls.some((args) => args[0] === 'scripts/setup-www-redirect.mjs')).toBe(true)
    expect(mock.state.commands.some((command) => command.includes('migrations'))).toBe(false)
  })
  it('邮箱登录缺发件地址时在写文件前停止', async () => {
    const logs: string[] = []
    const code = await main(['--apply'], {
      read: (p: string) => p === 'site.setup.json' ? JSON.stringify({ ...setup, email: { loginEnabled: true, from: '' } }) : raw,
      write: () => { throw new Error('不应写入') }, log: (line: string) => logs.push(line),
    })
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('EMAIL_FROM')
  })
  it('平台找不到域名时提供明确诊断并且不暴露子进程输出', async () => {
    const mock = simulatedCloudflare()
    const logs: string[] = []
    const configured = { ...setup, platforms: { cloudflare: { turnstile: true } } }
    const code = await main(['--apply'], {
      exists: () => true,
      read: (p: string) => p === 'site.setup.json' ? JSON.stringify(configured) : p === '.dev.vars.platform' ? 'CLOUDFLARE_API_TOKEN=test-token\n' : raw,
      write: () => {}, runWrangler: mock.run,
      runNode: () => ({ ok: false, output: 'Cloudflare zone not found or inaccessible; test-token' }),
      log: (line: string) => logs.push(line),
    })
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('当前平台 Token 没有读取该 Zone 的权限')
    expect(logs.join('\n')).not.toContain('test-token')
  })
  it('验证时发现公开配置不同步则先停止，不执行远端操作', async () => {
    const logs: string[] = []
    let calls = 0
    const code = await main(['--verify'], { read: (p: string) => p === 'site.setup.json' ? JSON.stringify({ ...setup, video: { provider: 'fal' } }) : raw,
      log: (line: string) => logs.push(line), runWrangler: () => { calls++; throw new Error('不应联网') } })
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('VIDEO_PROVIDER')
    expect(calls).toBe(0)
  })
  it('不允许单独指定迁移而不执行初始化', async () => {
    expect(await main(['--with-migrations'], { log: () => {} })).toBe(1)
  })
})
