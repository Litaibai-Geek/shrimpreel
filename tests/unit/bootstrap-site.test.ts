import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  ensureCloudflare, main, parseList, patchPublicVars, planDescription,
  updateResourceId, validateSetup,
} from '../../scripts/bootstrap-site.mjs'

const raw = readFileSync('wrangler.jsonc', 'utf8')
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
  it('parses JSON wrapped by Wrangler notices, rejects unknown formats', () => {
    expect(parseList('update notice\n[{"name":"my-db"}]\n')).toEqual([{ name: 'my-db' }])
    expect(() => parseList('cannot connect')).toThrow('JSON list')
  })
  it('blocks wrong Worker and mismatched site domains', () => {
    expect(() => validateSetup({ ...setup, site: { ...setup.site, domain: 'different.ai' } }, config)).toThrow('site.domain differs')
    expect(() => validateSetup({ ...setup, site: { ...setup.site, name: 'different-worker' } }, config)).toThrow('Worker name differs')
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
  it('sets public vars without embedding any secrets or removing JSONC comments', () => {
    const updated = patchPublicVars(raw, setup)
    expect(updated).toContain('test.apps.googleusercontent.com')
    expect(updated).toContain('// 新站点')
    expect(updated).not.toContain('GOOGLE_CLIENT_SECRET')
  })
  it('requires extra consent for live Waffo product creation and remote D1 migrations', async () => {
    const live = { ...setup, payment: { provider: 'waffo', environment: 'prod', storeId: 'STO_test', createProducts: true } }
    const logs: string[] = []
    const run = async (argv: string[]) => main(argv, {
      read: (p: string) => p === 'site.setup.json' ? JSON.stringify(live) : raw,
      write: () => { throw new Error('do not write') },
      log: (v: string) => { logs.push(v) },
    })
    expect(await run(['--apply'])).toBe(1)
    expect(logs.join('\n')).toContain('--allow-live-payments')
    expect(await run(['--with-migrations'])).toBe(1)
  })
})
