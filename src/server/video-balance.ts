import { site } from '#/config/site'
import { cleanSecret } from './util'
import { activeVideoProviderId } from './video'

// 视频服务商余额查询：后台“测试连接”（probes.ts）和 Cron 的主动余额告警（alerts.ts）共用。
// 只发一次只读 GET，不回显密钥；各种失败情形用 status 区分，由调用方决定怎么说。

export interface VideoBalance {
  provider: string
  amount: number
  currency: string
  // Kie.ai 返回的是 credits；用当前模型页标价换算美元，仅用于统一的低余额告警阈值。
  amountUsd?: number
}

export type BalanceQuery =
  | { status: 'mock' }
  | { status: 'no_key'; keyName: string }
  | { status: 'unauthorized'; keyName: string }
  // 只有 fal：Key 有效但权限范围不含 billing:usage:read
  | { status: 'forbidden'; keyName: string }
  | { status: 'http'; code: number }
  | { status: 'unreadable' }
  | ({ status: 'ok' } & VideoBalance)

function readBalance(provider: string, amount: unknown, currency: unknown): BalanceQuery {
  const value = Number(amount)
  return Number.isFinite(value) ? { status: 'ok', provider, amount: value, currency: String(currency ?? 'USD') } : { status: 'unreadable' }
}

export async function queryVideoBalance(env: Env): Promise<BalanceQuery> {
  const id = activeVideoProviderId(env)
  if (id === 'mock') return { status: 'mock' }
  if (id === 'fal') {
    const key = cleanSecret(env.FAL_KEY)
    if (!key) return { status: 'no_key', keyName: 'FAL_KEY' }
    const response = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', { headers: { Authorization: `Key ${key}` } })
    if (response.status === 401) return { status: 'unauthorized', keyName: 'FAL_KEY' }
    if (response.status === 403) return { status: 'forbidden', keyName: 'FAL_KEY' }
    if (!response.ok) return { status: 'http', code: response.status }
    const body = (await response.json().catch(() => null)) as { credits?: { current_balance?: unknown; currency?: unknown } } | null
    return readBalance('fal', body?.credits?.current_balance, body?.credits?.currency)
  }
  if (id === 'nanoapi') {
    const key = cleanSecret(env.NANOAPI_API_KEY)
    if (!key) return { status: 'no_key', keyName: 'NANOAPI_API_KEY' }
    const response = await fetch('https://api.nanoapi.ai/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
    if (response.status === 401) return { status: 'unauthorized', keyName: 'NANOAPI_API_KEY' }
    if (!response.ok) return { status: 'http', code: response.status }
    const body = (await response.json().catch(() => null)) as { data?: { available?: unknown; currency?: unknown } } | null
    return readBalance('NanoAPI', body?.data?.available, body?.data?.currency)
  }
  if (id === 'kie') {
    const key = cleanSecret(env.KIE_API_KEY)
    if (!key) return { status: 'no_key', keyName: 'KIE_API_KEY' }
    const response = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers: { Authorization: `Bearer ${key}` } })
    const body = (await response.json().catch(() => null)) as { code?: number | string; data?: unknown } | null
    if (response.status === 401 || Number(body?.code) === 401) return { status: 'unauthorized', keyName: 'KIE_API_KEY' }
    if (!response.ok) return { status: 'http', code: response.status }
    if (!body || Number(body.code) !== 200) return { status: 'http', code: Number(body?.code ?? response.status) }
    const balance = readBalance('Kie.ai', body.data, 'credits')
    return balance.status === 'ok' ? { ...balance, amountUsd: balance.amount * site.video.kie.usdPerCredit } : balance
  }
  const key = cleanSecret(env.YIR_API_KEY)
  if (!key) return { status: 'no_key', keyName: 'YIR_API_KEY' }
  const response = await fetch('https://gateway.yir.ai/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
  if (response.status === 401) return { status: 'unauthorized', keyName: 'YIR_API_KEY' }
  if (!response.ok) return { status: 'http', code: response.status }
  const body = (await response.json().catch(() => null)) as { available_amount?: unknown; currency?: unknown } | null
  return readBalance('yir', body?.available_amount, body?.currency)
}

// 查到余额返回 { provider, amount, currency }；mock、没配 Key、Key 无效、没权限或读不到时返回 null。
// 网络错误会抛出，由调用方记日志。
export async function fetchVideoBalance(env: Env): Promise<VideoBalance | null> {
  const result = await queryVideoBalance(env)
  if (result.status === 'http') throw new Error(`video balance HTTP ${result.code}`)
  return result.status === 'ok' ? result : null
}
