// Wrangler 优先使用显式环境变量，其次使用已忽略的本地平台凭据。
import { existsSync, readFileSync } from 'node:fs'

/** @param {Record<string, string | undefined>} env */
export function cloudflareEnv(env = process.env, platformFile = '.dev.vars.platform') {
  if (env.CLOUDFLARE_API_TOKEN || !existsSync(platformFile)) return { ...env }
  const text = readFileSync(platformFile, 'utf8')
  const matches = [...text.matchAll(/^\s*(?:export\s+)?CLOUDFLARE_API_TOKEN\s*=\s*(.*?)\s*$/gm)]
  if (matches.length > 1) throw new Error('平台凭据中 CLOUDFLARE_API_TOKEN 重复')
  if (!matches.length) return { ...env }
  let token = matches[0][1].trim()
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1, -1)
  else token = token.replace(/\s+#.*$/, '')
  return token ? { ...env, CLOUDFLARE_API_TOKEN: token } : { ...env }
}
