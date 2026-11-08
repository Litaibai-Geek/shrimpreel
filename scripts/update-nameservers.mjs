#!/usr/bin/env node
// 默认只查询；--apply 复用初始化的 DNS、DNSSEC 和现有记录保护。
import { existsSync, readFileSync } from 'node:fs'
import { parseDotenv } from './sync-secrets.mjs'
import { autoUpdateAndWaitForDNS, checkNameserversPropagation, getCurrentNameservers } from './spaceship-dns.mjs'

async function main() {
  const setup = JSON.parse(readFileSync('site.setup.json', 'utf8'))
  const domain = setup.site?.domain
  const nameServers = setup.platforms?.cloudflare?.nameServers
  const parsed = existsSync('.dev.vars.platform') ? parseDotenv(readFileSync('.dev.vars.platform', 'utf8')) : { entries: [], errors: [] }
  if (parsed.errors.length) throw new Error('平台凭据文件格式无效')
  const vars = Object.fromEntries(parsed.entries)
  const key = process.env.SPACESHIP_API_KEY || vars.SPACESHIP_API_KEY
  const secret = process.env.SPACESHIP_API_SECRET || vars.SPACESHIP_API_SECRET
  if (!domain || !Array.isArray(nameServers) || !nameServers.length) throw new Error('站点域名或 Cloudflare nameserver 未配置')
  if (!key || !secret) throw new Error('缺少 Spaceship API 凭据')
  if (process.argv.includes('--apply')) {
    if (!await autoUpdateAndWaitForDNS(domain, nameServers, key, secret)) process.exitCode = 1
    return
  }
  const current = await getCurrentNameservers(domain, key, secret)
  const observed = await checkNameserversPropagation(domain, nameServers)
  console.log('注册商 nameserver：' + current.join(', '))
  console.log('目标 nameserver：' + nameServers.join(', '))
  console.log(observed.propagated ? 'DNS 查询已返回目标 nameserver；Cloudflare Zone 是否激活需另行确认。' : 'DNS 查询尚未确认目标 nameserver。')
  console.log('预演模式；如需执行安全检查并更新，请使用 npm run dns:update -- --apply。')
}

main().catch((error) => { console.error('✗ ' + error.message); process.exitCode = 1 })
