/**
 * Spaceship 域名注册商自动 DNS 更新模块
 * 由 bootstrap-site.mjs 调用，自动更新 nameserver 到 Cloudflare
 */

const SPACESHIP_API = 'https://spaceship.dev/api/v1'

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
    const text = await response.text()
    throw new Error(`Spaceship API error: ${response.status} ${text}`)
  }

  return response.json()
}

/**
 * 获取当前域名的 nameserver
 */
export async function getCurrentNameservers(domain, apiKey, apiSecret) {
  try {
    const data = await spaceshipRequest(`/domains/${encodeURIComponent(domain)}/nameservers`, {
      apiKey,
      apiSecret,
    })
    return data.hosts || []
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
export async function checkNameserversPropagation(domain, expectedNameservers) {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
    `https://dns.google/resolve?name=${domain}&type=NS`,
  ]

  const results = []
  for (const url of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5秒超时

      const response = await fetch(url, {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data = await response.json()
      const nameservers = data.Answer?.map(record => record.data.toLowerCase().replace(/\.$/, '')) || []
      results.push(...nameservers)
    } catch (error) {
      // Fetch 失败时忽略，继续下一个端点
      continue
    }
  }

  const publicNameservers = new Set(results)
  const expected = new Set(expectedNameservers.map(ns => ns.toLowerCase()))

  return {
    propagated: expected.size > 0 && [...expected].every(ns => publicNameservers.has(ns)),
    current: [...publicNameservers],
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
    const { current: currentPublicNS } = await checkNameserversPropagation(domain, nameServers)
    const currentSet = new Set(currentPublicNS.map(ns => ns.toLowerCase()))
    const targetSet = new Set(nameServers.map(ns => ns.toLowerCase()))
    const alreadyCorrect = targetSet.size > 0 && [...targetSet].every(ns => currentSet.has(ns))

    if (alreadyCorrect) {
      log('✓ DNS 已经是 Cloudflare nameserver，无需更新')
      log(`  当前公共 DNS：${currentPublicNS.join(', ')}`)
      return true
    }

    log(`  当前公共 DNS：${currentPublicNS.length > 0 ? currentPublicNS.join(', ') : '尚未传播'}`)
    log(`  目标 nameserver：${nameServers.join(', ')}`)

    // 2. 直接更新 nameserver（不先查询 Spaceship）
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
        log(`✓ DNS 已全球传播（耗时 ${elapsed} 秒）`)
        log(`  公共 DNS 查询：${publicNS.join(', ')}`)
        return true
      }

      // 未传播，显示进度
      const progress = `[${elapsed}s/${maxWaitSeconds}s]`
      const status = publicNS.length > 0 ? `检测到: ${publicNS.join(', ')}` : '尚未传播'
      log(`  ${progress} 第 ${attempt} 次检查：${status}`)
    }
  } catch (error) {
    log(`✗ DNS 自动更新失败: ${error.message}`)
    log('请手动在域名注册商更新 nameserver 为：' + nameServers.join(', '))
    return false
  }
}
