#!/usr/bin/env node
// 部署前核对站点配置；不从密钥文件覆盖公开变量，也不绕过初始化的保护检查。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { normalizeSetup, patchPublicVars, patchTestPayment, validateSetup } from './bootstrap-site.mjs'
import { parseDotenv } from './sync-secrets.mjs'

export function syncGa4Config(siteCode, envText) {
  const parsed = parseDotenv(envText)
  if (parsed.errors.length) throw new Error('生产配置文件格式错误')
  const entries = parsed.entries.filter(([key]) => key === 'GA4_MEASUREMENT_ID')
  if (entries.length > 1) throw new Error('GA4_MEASUREMENT_ID 重复配置')
  if (!entries.length) return siteCode
  const id = entries[0][1].trim()
  if (id && !/^G-[A-Z0-9]+$/.test(id)) throw new Error('GA4_MEASUREMENT_ID 格式应为 G- 开头的 GA4 Measurement ID')
  const pattern = /(\bga4Id:\s*)'[^']*'/g
  if ([...siteCode.matchAll(pattern)].length !== 1) throw new Error('站点 GA4 配置缺失或重复')
  return siteCode.replace(pattern, (_, prefix) => prefix + "'" + id + "'")
}

export function checkPublicConfig(wrangler, setup) {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', wrangler)
  if (parsed.error) throw new Error('wrangler.jsonc 格式错误')
  const normalized = normalizeSetup(setup, parsed.config)
  validateSetup(normalized, parsed.config)
  const target = ts.parseConfigFileTextToJson('wrangler.jsonc', patchPublicVars(wrangler, normalized))
  if (target.error) throw new Error('生成的配置格式错误')
  const before = parsed.config.vars ?? {}
  const after = target.config.vars ?? {}
  return Object.keys(after).filter((key) => before[key] !== after[key])
}

export function main() {
  try {
    const setup = JSON.parse(readFileSync('site.setup.json', 'utf8'))
    const pending = checkPublicConfig(readFileSync('wrangler.jsonc', 'utf8'), setup)
    if (pending.length) {
      console.error('站点配置尚未同步到 wrangler.jsonc：' + pending.join('、'))
      console.error('请先运行 npm run setup -- --plan，核对后执行初始化。')
      return 1
    }
    if (setup.payment?.testPackageEnabled !== undefined) {
      const code = readFileSync('src/config/site.ts', 'utf8')
      if (patchTestPayment(code, setup.payment.testPackageEnabled) !== code) throw new Error('测试支付开关尚未同步，请先运行 npm run setup -- --apply')
    }
    if (existsSync('.dev.vars.production')) {
      const path = 'src/config/site.ts'
      const original = readFileSync(path, 'utf8')
      const updated = syncGa4Config(original, readFileSync('.dev.vars.production', 'utf8'))
      if (updated !== original) {
        writeFileSync(path, updated, 'utf8')
        console.log('GA4 站点配置已同步。')
      }
    }
    console.log('站点公开配置已同步。')
    return 0
  } catch (error) {
    console.error('站点配置检查失败：' + error.message)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main()
