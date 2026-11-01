#!/usr/bin/env node
// 通过 Wrangler 添加自定义域名路由
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cloudflareEnv } from './cloudflare-env.mjs'

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))

console.log('正在为 Worker 添加自定义域名路由...')

// 使用 wrangler triggers deploy 来添加路由
const result = spawnSync(
  process.execPath,
  [wrangler, 'triggers', 'deploy'],
  {
    stdio: 'inherit',
    env: cloudflareEnv(),
    cwd: process.cwd()
  }
)

if (result.error) {
  console.error('添加域名失败：' + result.error.message)
  process.exit(1)
}

if (result.status === 0) {
  console.log('\n✓ 自定义域名已添加')
  console.log('访问地址：https://tinydeskai.website')
} else {
  console.error('\n✗ 添加域名失败，退出码：' + result.status)
  process.exit(result.status)
}
