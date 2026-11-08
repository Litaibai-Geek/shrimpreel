/**
 * Spaceship 域名注册商自动 DNS 更新模块
 * 由 bootstrap-site.mjs 调用，自动更新 nameserver 到 Cloudflare
 */

import { resolveNs } from 'node:dns/promises'

const SPACESHIP_API = 'https://spaceship.dev/api/v1'

function sameNameservers(actual, expected) {
  const normalize = (items) => new Set(items.map((item) => item.toLowerCase().replace(/\.$/, '')))
  const a = normalize(actual), b = normalize(expected)
  return b.size > 0 && a.size === b.size && [...b].every((name) => a.has(name))
}

/**
 * 调用 Spaceship API
 */
export async function spaceshipRequest(path, { apiKey, apiSecret, method = 'GET', body } = {}) {
  const url = `${SPACESHIP_API}${path}`
  const headers = {
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'TinyDeskAI-Deploy/1.0',
  }

  const options = { method, headers }
  if (body) options.body = JSON.stringify(body)

  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`Spaceship API HTTP ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

/**
 * 获取当前域名的 nameserver
 */
export async function getCurrentNameservers(domain, apiKey, apiSecret) {
  try {
    const data = await spaceshipRequest(`/domains/${encodeURIComponent(domain)}`, {
      apiKey,
      apiSecret,
    })
    return data.nameservers?.hosts || []
  } catch (error) {
    // 如果 404，可能域名不在这个账号中
    if (error.message.includes('404')) {
      throw new Error(`域名 ${domain} 在 Spaceship 中未找到，请确认域名是否在当前账号中`)
    }
    throw error
  }
}

/**
 * 更新域名的 nameserver
 */
export async function updateNameservers(domain, nameServers, apiKey, apiSecret) {
  await spaceshipRequest(`/domains/${encodeURIComponent(domain)}/nameservers`, {
    apiKey,
    apiSecret,
    method: 'PUT',
    body: { provider: 'custom', hosts: nameServers },
  })
}

/**
 * 检查 nameserver 是否已经生效（通过公共 DNS 查询）
 */
export async function checkNameserversPropagation(domain, expectedNameservers, systemResolveNs = resolveNs) {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
    `https://dns.google/resolve?name=${domain}&type=NS`,
  ]

  const results = []
  for (const url of endpoints) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller.signal
      })
      if (!response.ok) continue
      const data = await response.json()
      const nameservers = data.Answer?.filter(record => record.type === undefined || record.type === 2).map(record => record.data.toLowerCase().replace(/\.$/, '')) || []
      if (nameservers.length) results.push(nameservers)
    } catch (error) {
      // Fetch 失败时忽略，继续下一个端点
      continue
    } finally {
      clearTimeout(timeoutId)
    }
  }

  if (!results.length) {
    try {
      const nameservers = await systemResolveNs(domain)
      if (nameservers.length) results.push(nameservers)
    } catch {}
  }

  return {
    propagated: results.some((nameservers) => sameNameservers(nameservers, expectedNameservers)),
    current: [...new Set(results.flat())],
  }
}

/**
 * 自动更新 nameserver 并轮询检测，直到 DNS 传播完成
 * @param {string} domain - 域名
 * @param {string[]} nameServers - Cloudflare nameserver 列表
 * @param {string} apiKey - Spaceship API Key
 * @param {string} apiSecret - Spaceship API Secret
 * @param {Function} log - 日志函数
 * @param {number} maxWaitSeconds - 最长等待时间（秒），默认 1800 (30分钟)
 * @param {number} pollIntervalSeconds - 轮询间隔（秒），默认 30
 * @returns {Promise<boolean>} - 是否成功
 */
export async function autoUpdateAndWaitForDNS(
  domain,
  nameServers,
  apiKey,
  apiSecret,
  log = console.log,
  maxWaitSeconds = 1800,
  pollIntervalSeconds = 30
) {
  if (!apiKey || !apiSecret) {
    log('⚠ 未配置 Spaceship API 凭据（SPACESHIP_API_KEY/SECRET），跳过自动 DNS 更新')
    log('请手动在域名注册商更新 nameserver 为：' + nameServers.join(', '))
    return false
  }

  try {
    // 1. 检查当前公共 DNS 的 nameserver（不查询 Spaceship API）
    log('正在检查当前 DNS 状态...')
    const { current: currentPublicNS, propagated: alreadyCorrect } = await checkNameserversPropagation(domain, nameServers)

    if (alreadyCorrect) {
      log('✓ DNS 已经是 Cloudflare nameserver，无需更新')
      log(`  当前公共 DNS：${currentPublicNS.join(', ')}`)
      return true
    }

    log(`  当前 DNS 查询：${currentPublicNS.length > 0 ? currentPublicNS.join(', ') : '无法获取结果'}`)
    log(`  目标 nameserver：${nameServers.join(', ')}`)

    // 只能确认 Spaceship Basic DNS 的完整记录；其他 DNS 服务不能安全迁移。
    const domainInfo = await spaceshipRequest(`/domains/${encodeURIComponent(domain)}`, { apiKey, apiSecret })
    if (sameNameservers(domainInfo.nameservers?.hosts ?? [], nameServers)) {
      log('注册商已配置目标 nameserver；DNS 查询尚未确认，请稍后重试。')
      return false
    }
    if (domainInfo.nameservers?.provider !== 'basic') throw new Error('当前并非 Spaceship Basic DNS，无法确认现有 DNS 记录')
    const records = await spaceshipRequest(`/dns/records/${encodeURIComponent(domain)}?take=1&skip=0`, { apiKey, apiSecret })
    if (!Array.isArray(records.items) || !Number.isInteger(records.total)) throw new Error('无法确认现有 DNS 记录')
    if (records.total !== 0) throw new Error('现有 DNS 包含记录，自动切换前必须先迁移并核对')
    let dsResponse
    try {
      dsResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=DS`, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) })
    } catch { throw new Error('无法查询 DNSSEC 状态，拒绝自动切换') }
    if (!dsResponse.ok) throw new Error('无法验证 DNSSEC 状态')
    const ds = await dsResponse.json()
    if (ds.Status !== 0 || ds.Answer?.some(record => record.type === 43)) throw new Error('域名存在 DNSSEC DS 记录或状态无法验证，拒绝自动切换')

    // 2. 确认旧 DNS 没有自定义记录且 DNSSEC 不会阻断解析后再切换。
    log('正在通过 Spaceship API 更新 nameserver...')
    await updateNameservers(domain, nameServers, apiKey, apiSecret)
    log('✓ 已提交 nameserver 更新到 Spaceship')

    // 3. 轮询检测 DNS 传播状态
    log('')
    log('正在等待 DNS 全球传播...')
    const startTime = Date.now()
    let attempt = 0

    while (true) {
      attempt++
      const elapsed = Math.floor((Date.now() - startTime) / 1000)

      // 检查是否超时
      if (elapsed > maxWaitSeconds) {
        log(`⚠ DNS 传播超时（${maxWaitSeconds}秒），请稍后手动检查`)
        log('运行以下命令检查状态：')
        log('  npm run dns:update')
        return false
      }

      // 等待一段时间再检查（首次等待 10 秒，之后按设定间隔）
      const waitTime = attempt === 1 ? 10 : pollIntervalSeconds
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000))

      // 检查 DNS 传播状态
      const { propagated, current: publicNS } = await checkNameserversPropagation(domain, nameServers)

      if (propagated) {
        log(`✓ DNS 查询已返回目标 nameserver（耗时 ${elapsed} 秒）`)
        log(`  公共 DNS 查询：${publicNS.join(', ')}`)
        return true
      }

      // 未传播，显示进度
      const progress = `[${elapsed}s/${maxWaitSeconds}s]`
      const status = publicNS.length > 0 ? `检测到: ${publicNS.join(', ')}` : '无法获取 DNS 查询结果'
      log(`  ${progress} 第 ${attempt} 次检查：${status}`)
    }
  } catch (error) {
    log(`✗ DNS 自动更新失败: ${error.message}`)
    log('请手动在域名注册商更新 nameserver 为：' + nameServers.join(', '))
    return false
  }
}
