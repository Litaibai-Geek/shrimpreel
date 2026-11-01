#!/usr/bin/env node
// 使用 Rulesets API 将 www 永久重定向到主域名，不覆盖其他规则。
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { site } from '../src/config/site.ts'
import { cloudflareEnv } from './cloudflare-env.mjs'
import { discoverCloudflareIds } from './bootstrap-platforms.mjs'

export function redirectRule(domain) {
  return {
    ref: 'redirect_www_to_apex',
    description: 'Redirect www to canonical domain',
    expression: `(http.host eq "www.${domain}")`,
    action: 'redirect',
    action_parameters: { from_value: { target_url: { expression: `concat("https://${domain}", http.request.uri.path)` }, status_code: 308, preserve_query_string: true } },
    enabled: true,
  }
}

export async function ensureWwwRedirect(api, zoneId, domain) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('无效的域名')
  const name = `www.${domain}`
  const records = await api('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`)
  if (!Array.isArray(records)) throw new Error('无法读取 www DNS 记录')
  const addresses = records.filter((record) => ['A', 'AAAA', 'CNAME'].includes(record.type))
  if (addresses.some((record) => !record.proxied)) throw new Error('现有 www DNS 未启用代理，未修改')
  if (!addresses.length) {
    await api('POST', `/zones/${zoneId}/dns_records`, { type: 'CNAME', name, content: domain, proxied: true, ttl: 1 })
  }
  const rule = redirectRule(domain)
  const phase = `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`
  let entry
  try { entry = await api('GET', phase) }
  catch (error) { if (error.status !== 404) throw error }
  if (!entry) {
    await api('POST', `/zones/${zoneId}/rulesets`, { name: 'Canonical hostname redirect', kind: 'zone', phase: 'http_request_dynamic_redirect', rules: [rule] })
    return 'created'
  }
  if (!entry.id || !Array.isArray(entry.rules)) throw new Error('无法读取已有重定向规则')
  const candidates = entry.rules.filter((item) => item.ref === rule.ref || item.expression?.includes(`www.${domain}`))
  if (candidates.length) {
    if (candidates.length !== 1) throw new Error('存在多条 www 重定向规则，请先核对')
    const existing = candidates[0], v = existing.action_parameters?.from_value
    if (existing.action !== 'redirect' || existing.enabled === false || existing.expression !== rule.expression || v?.status_code !== 308 || v?.preserve_query_string !== true || v?.target_url?.expression !== rule.action_parameters.from_value.target_url.expression) {
      throw new Error('现有 www 重定向规则与目标不一致，未覆盖')
    }
    return 'existing'
  }
  await api('POST', `/zones/${zoneId}/rulesets/${entry.id}/rules`, rule)
  return 'created'
}

export async function main(args = process.argv.slice(2)) {
  try {
    const index = args.indexOf('--config')
    const setup = JSON.parse(readFileSync(index >= 0 ? args[index + 1] : 'site.setup.json', 'utf8'))
    const domain = setup.site?.domain || site.domain
    const token = cloudflareEnv().CLOUDFLARE_API_TOKEN
    if (!token) throw new Error('缺少 Cloudflare Token')
    const api = async (method, path, body) => {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
        method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) { const error = new Error(`Cloudflare API ${method} HTTP ${response.status}`); error.status = response.status; throw error }
      const json = await response.json()
      if (!json.success) throw new Error('Cloudflare API 请求未成功')
      return json.result
    }
    const cf = await discoverCloudflareIds(api, domain, setup.platforms?.cloudflare ?? {})
    const result = await ensureWwwRedirect(api, cf.zoneId, domain)
    console.log(result === 'existing' ? 'www 重定向已存在并验证' : 'www 重定向已创建')
    return 0
  } catch (error) {
    console.error('www 重定向配置失败：' + error.message)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code })
