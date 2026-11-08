import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('新站初始化', () => {
  it('发现复杂的已有 Worker 路由时拒绝重写配置', () => {
    mkdirSync('.tmp', { recursive: true })
    const dir = mkdtempSync(resolve('.tmp/new-site-test-'))
    for (const folder of ['src/config', 'src/content']) mkdirSync(join(dir, folder), { recursive: true })
    for (const file of ['src/config/site.ts', 'src/content/en.ts', 'src/content/zh.ts', 'package.json', 'site.setup.example.json', '.dev.vars.example']) copyFileSync(file, join(dir, file))
    const wrangler = readFileSync('wrangler.jsonc', 'utf8').replace('"workers_dev": true,', '"workers_dev": true,\n  "routes": [{"pattern":"other.example.com/*","zone_name":"example.com"}],')
    writeFileSync(join(dir, 'wrangler.jsonc'), wrangler)
    const run = spawnSync(process.execPath, [resolve('scripts/new-site.mjs'), '--keyword', 'Example', '--domain', 'example.net', '--name', 'example-site', '--write'], { cwd: dir, encoding: 'utf8' })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('现有 Worker 路由无法安全迁移')
    expect(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')).toBe(wrangler)
  })

  it('同站重复执行时保留现有 D1 和 KV 标识', () => {
    mkdirSync('.tmp', { recursive: true })
    const dir = mkdtempSync(resolve('.tmp/new-site-test-'))
    for (const folder of ['src/config', 'src/content']) mkdirSync(join(dir, folder), { recursive: true })
    for (const file of ['src/config/site.ts', 'src/content/en.ts', 'src/content/zh.ts', 'package.json', 'site.setup.example.json', '.dev.vars.example']) copyFileSync(file, join(dir, file))
    const db = '12345678-1234-4234-8234-123456789abc', kv = 'a'.repeat(32)
    const wrangler = readFileSync('wrangler.jsonc', 'utf8')
      .replace('"database_id": "preview"', `"database_id": "${db}"`)
      .replace('"binding": "KV", "id": "preview"', `"binding": "KV", "id": "${kv}"`)
    writeFileSync(join(dir, 'wrangler.jsonc'), wrangler)
    const run = spawnSync(process.execPath, [resolve('scripts/new-site.mjs'), '--keyword', 'Example', '--domain', 'example.com', '--name', 'video-template', '--write'], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    const output = readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')
    expect(output).toContain(db)
    expect(output).toContain(kv)
  })

  it('清理旧站支付映射并仅在缺失时创建配置和独立密钥', () => {
    mkdirSync('.tmp', { recursive: true })
    const dir = mkdtempSync(resolve('.tmp/new-site-test-'))
    for (const folder of ['src/config', 'src/content']) mkdirSync(join(dir, folder), { recursive: true })
    for (const file of ['src/config/site.ts', 'src/content/en.ts', 'src/content/zh.ts', 'package.json', 'site.setup.example.json', '.dev.vars.example']) {
      copyFileSync(file, join(dir, file))
    }
    const wrangler = readFileSync('wrangler.jsonc', 'utf8')
      .replace('"WAFFO_PRODUCTS": "{}"', '"WAFFO_PRODUCTS": "{\\"starter\\":\\"old\\"}"')
      .replace('"TURNSTILE_SITE_KEY": ""', '"TURNSTILE_SITE_KEY": "old-site-key"')
      .replace('"WAFFO_ENVIRONMENT": "test"', '"WAFFO_ENVIRONMENT": "prod"')
    writeFileSync(join(dir, 'wrangler.jsonc'), wrangler)
    const run = spawnSync(process.execPath, [resolve('scripts/new-site.mjs'), '--keyword', 'Example', '--domain', 'example.net', '--name', 'example-site', '--write'], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    const output = readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')
    expect(output).toContain('"WAFFO_PRODUCTS": "{}"')
    expect(output).toContain('"TURNSTILE_SITE_KEY": ""')
    expect(output).toContain('"WAFFO_ENVIRONMENT": "test"')
    expect(output).toContain('"workers_dev": false')
    expect(output).toContain('"preview_urls": false')
    expect(output).toContain('"pattern":"example.net"')
    expect(output).toContain('"custom_domain":true')
    expect(output).toContain('"APP_ENV": "production"')
    expect(output).toContain('"SITE_URL": "https://example.net"')
    expect(JSON.parse(readFileSync(join(dir, 'site.setup.json'), 'utf8')).site.adminEmail).toBe('admin@example.com')
    expect(readFileSync(join(dir, '.dev.vars.production'), 'utf8')).toMatch(/^SESSION_SECRET=[a-f0-9]{64}$/m)
    const beforeSetup = readFileSync(join(dir, 'site.setup.json'), 'utf8')
    const beforeSecrets = readFileSync(join(dir, '.dev.vars.production'), 'utf8')
    // 测试进程引用仓库中的 site.ts；恢复夹具以模拟重新派生。
    copyFileSync('src/config/site.ts', join(dir, 'src/config/site.ts'))
    const retry = spawnSync(process.execPath, [resolve('scripts/new-site.mjs'), '--keyword', 'Example', '--domain', 'example.net', '--name', 'example-site', '--write'], { cwd: dir, encoding: 'utf8' })
    expect(retry.status, retry.stderr).toBe(0)
    expect(readFileSync(join(dir, 'site.setup.json'), 'utf8')).toBe(beforeSetup)
    expect(readFileSync(join(dir, '.dev.vars.production'), 'utf8')).toBe(beforeSecrets)
  })
})
