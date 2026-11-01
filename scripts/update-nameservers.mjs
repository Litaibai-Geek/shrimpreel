#!/usr/bin/env node
/**
 * 自动更新 Spaceship 域名的 nameserver 到 Cloudflare
 * 用法：node scripts/update-nameservers.mjs [--apply]
 */

import { readFileSync } from 'fs'

const SPACESHIP_API = 'https://spaceship.dev/api/v1'

/**
 * 从 site.setup.json 和环境变量读取配置
 */
function loadConfig() {
  try {
    const setup = JSON.parse(readFileSync('site.setup.json', 'utf8'))
    const domain = setup.site?.domain || new URL(setup.site?.url || '').hostname
    const nameServers = setup.platforms?.cloudflare?.nameServers

    // 优先从环境变量读取，其次从 .dev.vars.platform 读取
    let apiKey = process.env.SPACESHIP_API_KEY
    let apiSecret = process.env.SPACESHIP_API_SECRET

    if ((!apiKey || !apiSecret) && readFileSync('.dev.vars.platform', 'utf8')) {
      const platformVars = readFileSync('.dev.vars.platform', 'utf8')
      const keyMatch = platformVars.match(/SPACESHIP_API_KEY\s*=\s*["']?([^"'\n]+)["']?/)
      const secretMatch = platformVars.match(/SPACESHIP_API_SECRET\s*=\s*["']?([^"'\n]+)["']?/)

      if (keyMatch) apiKey = keyMatch[1].trim()
      if (secretMatch) apiSecret = secretMatch[1].trim()
    }

    return { domain, nameServers, apiKey, apiSecret }
  } catch (error) {
    console.error('读取配置失败:', error.message)
    process.exit(1)
  }
}

/**
 * 调用 Spaceship API
 */
async function spaceshipRequest(path, { apiKey, apiSecret, method = 'GET', body } = {}) {
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
async function getCurrentNameservers(domain, apiKey, apiSecret) {
  const data = await spaceshipRequest(`/domains/${encodeURIComponent(domain)}/nameservers`, {
    apiKey,
    apiSecret,
  })
  return data.hosts || []
}

/**
 * 更新域名的 nameserver
 */
async function updateNameservers(domain, nameServers, apiKey, apiSecret) {
  await spaceshipRequest(`/domains/${encodeURIComponent(domain)}/nameservers`, {
    apiKey,
    apiSecret,
    method: 'PUT',
    body: { provider: 'custom', hosts: nameServers },
  })
}

/**
 * 检查 nameserver 是否已经生效
 */
async function checkNameserversPropagation(domain, expectedNameservers) {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
    `https://dns.google/resolve?name=${domain}&type=NS`,
  ]

  const results = await Promise.all(
    endpoints.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/dns-json' },
        })
        const data = await response.json()
        return data.Answer?.map(record => record.data.toLowerCase().replace(/\.$/, '')) || []
      } catch {
        return []
      }
    })
  )

  const publicNameservers = new Set(results.flat())
  const expected = new Set(expectedNameservers.map(ns => ns.toLowerCase()))

  return {
    propagated: expected.size > 0 && [...expected].every(ns => publicNameservers.has(ns)),
    current: [...publicNameservers],
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { domain, nameServers, apiKey, apiSecret } = loadConfig()

  // 检查配置
  if (!domain) {
    console.error('错误：site.setup.json 中缺少 site.domain 或 site.url')
    process.exit(1)
  }

  if (!nameServers || nameServers.length === 0) {
    console.error('错误：site.setup.json 中缺少 platforms.cloudflare.nameServers')
    console.error('请先运行 npm run setup -- --apply 创建 Cloudflare Zone')
    process.exit(1)
  }

  if (!apiKey || !apiSecret) {
    console.error('错误：缺少 Spaceship API 凭据')
    console.error('请设置环境变量：')
    console.error('  export SPACESHIP_API_KEY=your_api_key')
    console.error('  export SPACESHIP_API_SECRET=your_api_secret')
    console.error('')
    console.error('在 https://spaceship.dev/settings/api 获取 API 密钥')
    process.exit(1)
  }

  console.log(`域名：${domain}`)
  console.log(`目标 Nameservers：${nameServers.join(', ')}`)
  console.log('')

  // 获取当前 nameserver
  console.log('正在查询 Spaceship 当前配置...')
  const current = await getCurrentNameservers(domain, apiKey, apiSecret)
  console.log(`当前 Nameservers：${current.join(', ')}`)
  console.log('')

  // 检查是否需要更新
  const currentSet = new Set(current.map(ns => ns.toLowerCase()))
  const targetSet = new Set(nameServers.map(ns => ns.toLowerCase()))
  const needsUpdate = ![...targetSet].every(ns => currentSet.has(ns))

  if (!needsUpdate) {
    console.log('✓ Nameserver 已经是 Cloudflare，无需更新')

    // 检查 DNS 传播状态
    console.log('')
    console.log('正在检查 DNS 传播状态...')
    const { propagated, current: publicNS } = await checkNameserversPropagation(domain, nameServers)
    console.log(`公共 DNS 查询结果：${publicNS.join(', ')}`)

    if (propagated) {
      console.log('✓ DNS 已全球传播，域名已激活')
    } else {
      console.log('⚠ DNS 尚未完全传播，请等待几分钟')
    }
    return
  }

  if (!apply) {
    console.log('预演模式：加 --apply 参数后才会更新 Spaceship nameserver')
    console.log(`将会执行：更新 ${domain} 的 nameserver 为 Cloudflare`)
    return
  }

  // 更新 nameserver
  console.log('正在更新 Spaceship nameserver...')
  await updateNameservers(domain, nameServers, apiKey, apiSecret)
  console.log('✓ 已提交 nameserver 更新')
  console.log('')
  console.log('DNS 传播通常需要 5-30 分钟，请稍后运行以下命令检查状态：')
  console.log(`  node scripts/update-nameservers.mjs`)
}

main().catch(error => {
  console.error('执行失败:', error.message)
  process.exit(1)
})
