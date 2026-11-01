#!/usr/bin/env node
// 部署前核对站点配置；不从密钥文件覆盖公开变量，也不绕过初始化的保护检查。
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { normalizeSetup, patchPublicVars, validateSetup } from './bootstrap-site.mjs'

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
    const pending = checkPublicConfig(readFileSync('wrangler.jsonc', 'utf8'), JSON.parse(readFileSync('site.setup.json', 'utf8')))
    if (pending.length) {
      console.error('站点配置尚未同步到 wrangler.jsonc：' + pending.join('、'))
      console.error('请先运行 npm run setup -- --plan，核对后执行初始化。')
      return 1
    }
    console.log('站点公开配置已同步。')
    return 0
  } catch (error) {
    console.error('站点配置检查失败：' + error.message)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main()
