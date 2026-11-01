import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cloudflareEnv } from '../../scripts/cloudflare-env.mjs'

describe('Cloudflare 凭据选择', () => {
  it('使用平台文件并优先保留显式环境变量', () => {
    mkdirSync('.tmp', { recursive: true })
    const dir = mkdtempSync(join('.tmp', 'cloudflare-env-'))
    const file = join(dir, '.dev.vars.platform')
    writeFileSync(file, 'CLOUDFLARE_API_TOKEN="platform-token"\n')
    expect(cloudflareEnv({}, file).CLOUDFLARE_API_TOKEN).toBe('platform-token')
    expect(cloudflareEnv({ CLOUDFLARE_API_TOKEN: 'explicit-token' }, file).CLOUDFLARE_API_TOKEN).toBe('explicit-token')
    writeFileSync(file, 'CLOUDFLARE_API_TOKEN=a\nCLOUDFLARE_API_TOKEN=b\n')
    expect(() => cloudflareEnv({}, file)).toThrow('重复')
  })
})
