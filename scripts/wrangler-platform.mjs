#!/usr/bin/env node
// 为 npm 命令注入本地平台凭据，不打印或持久化密钥。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cloudflareEnv } from './cloudflare-env.mjs'

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
try {
  const result = spawnSync(process.execPath, [wrangler, ...process.argv.slice(2)], { stdio: 'inherit', env: cloudflareEnv() })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error('Wrangler 启动失败：' + error.message)
  process.exitCode = 1
}
