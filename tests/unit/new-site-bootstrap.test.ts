import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('新站初始化', () => {
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
