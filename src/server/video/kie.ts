// Kie.ai Market API: https://docs.kie.ai/market/bytedance/seedance-2-mini
// Seedance 2.0 Mini multimodal reference mode: one uploaded portrait + one R2-hosted reference clip.
// Do not send first_frame_url / last_frame_url together with reference_* fields; Kie documents these modes as mutually exclusive.
import { site } from '#/config/site'
import { BAND_MAX, BAND_MIN, bandPrompt } from '#/lib/band'
import { cleanSecret } from '../util'
import type { VideoProvider, VideoStatus } from './types'
import { VideoProviderError } from './types'

const API = 'https://api.kie.ai'

interface KieEnvelope<T> {
  code?: number | string
  msg?: string
  data?: T
}

interface KieTask {
  taskId?: string
  state?: string
  resultJson?: string | { resultUrls?: unknown[] }
  failCode?: string | number
  failMsg?: string
  creditsConsumed?: number | string
}

export function createKieProvider(env: Env): VideoProvider {
  const key = cleanSecret(env.KIE_API_KEY)

  function headers() {
    if (!key) throw new VideoProviderError('provider_not_configured', 'KIE_API_KEY missing', false)
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  }

  async function call<T>(stage: string, path: string, init: RequestInit = {}): Promise<T> {
    const authHeaders = headers()
    let response: Response
    try {
      response = await fetch(`${API}${path}`, { ...init, headers: authHeaders })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown'
      const uncertain = stage === 'submit'
      throw new VideoProviderError(`kie_${stage}_network`, `Kie.ai ${stage} network error: ${reason}`.slice(0, 500), !uncertain, uncertain)
    }

    const body = (await response.json().catch(() => null)) as KieEnvelope<T> | null
    const code = Number(body?.code ?? (response.ok ? 200 : response.status))
    if (!response.ok || !body || code !== 200 || body.data === undefined || body.data === null) {
      throw requestError(stage, response, body)
    }
    return body.data
  }

  return {
    id: 'kie',

    async submit(input) {
      const isBand = input.meta.mode === 'band'
      const images = input.imageUrls ?? [input.imageUrl]
      if (isBand && (images.length < BAND_MIN || images.length > BAND_MAX)) {
        throw new VideoProviderError('kie_invalid_band', 'Band needs 2–5 reference images', false)
      }
      const prompt = (isBand ? bandPrompt(images.length) : (input.style.prompt ?? site.video.kie.prompt)).trim()
      if (prompt.length < 3 || prompt.length > 20_000) {
        throw new VideoProviderError('kie_invalid_prompt', 'Seedance prompt must be between 3 and 20000 characters', false)
      }
      if (input.durationSeconds < 4 || input.durationSeconds > 15) {
        throw new VideoProviderError('kie_invalid_duration', 'Seedance 2.0 Mini supports output durations from 4 to 15 seconds', false)
      }

      const payload: Record<string, unknown> = {
        model: site.video.kie.model,
        input: {
          prompt,
          reference_image_urls: images,
          reference_video_urls: [input.sourceVideoUrl],
          generate_audio: site.video.kie.generateAudio,
          resolution: site.video.kie.resolution,
          aspect_ratio: site.video.kie.aspectRatio,
          duration: input.durationSeconds,
        },
      }
      // Kie callbacks require a publicly reachable HTTPS endpoint; local development uses polling only.
      if (input.webhookUrl.startsWith('https://')) payload.callBackUrl = input.webhookUrl

      const data = await call<{ taskId?: string }>('submit', '/api/v1/jobs/createTask', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!data.taskId) {
        throw new VideoProviderError('kie_submit_no_task_id', 'Kie.ai createTask returned no taskId', false, true)
      }
      return { requestId: data.taskId, meta: {} }
    },

    async status(requestId): Promise<VideoStatus> {
      const task = await call<KieTask>('status', `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(requestId)}`)
      const state = String(task.state ?? '').toLowerCase()

      if (state === 'waiting' || state === 'queuing' || state === 'generating') return { state: 'pending' }
      if (state === 'fail') {
        const rawCode = String(task.failCode ?? 'task_failed')
        const code = rawCode.startsWith('kie_') ? rawCode : `kie_${rawCode.toLowerCase()}`
        return {
          state: 'failed',
          code: code.slice(0, 100),
          message: String(task.failMsg ?? 'Kie.ai task failed').slice(0, 500),
        }
      }
      if (state !== 'success') return { state: 'pending' }

      const result = parseResultJson(task.resultJson)
      const url = result?.resultUrls?.find((value): value is string => typeof value === 'string' && value.startsWith('https://'))
      if (!url) {
        return { state: 'failed', code: 'kie_no_video', message: 'Kie.ai task succeeded without an HTTPS resultUrls video URL' }
      }

      const costCents = actualCostCents(task.creditsConsumed)
      return {
        state: 'completed',
        output: { url },
        ...(costCents === undefined ? {} : { costCents }),
      }
    },

    costCents: estimatedCostCents,
  }
}

export function estimatedCostCents(durationSeconds: number) {
  const config = site.video.kie
  // Kie bills both the 14s reference input and the selected output duration.
  return Math.round(
    (config.referenceVideoSeconds + durationSeconds) *
      config.estimatedCreditsPerBillableSecond *
      config.usdPerCredit *
      100,
  )
}

function actualCostCents(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const credits = Number(value)
  if (!Number.isFinite(credits) || credits < 0) return undefined
  return Math.round(credits * site.video.kie.usdPerCredit * 100)
}

function parseResultJson(value: KieTask['resultJson']): { resultUrls?: unknown[] } | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as { resultUrls?: unknown[] }) : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' ? value : null
}

function requestError(stage: string, response: Response, body: KieEnvelope<unknown> | null) {
  const code = Number(body?.code ?? response.status)
  const retryable = code === 408 || code === 429 || code >= 500 || response.status === 408 || response.status === 429 || response.status >= 500
  const uncertain = stage === 'submit' && (code >= 500 || response.status >= 500 || (code === 200 && body?.data == null))
  const normalizedCode =
    code === 401 ? 'kie_unauthorized' : code === 402 ? 'kie_insufficient_credits' : code === 429 ? 'kie_rate_limited' : `kie_${stage}_${code || response.status}`
  const message = String(body?.msg ?? 'Kie.ai request failed')
  return new VideoProviderError(
    normalizedCode,
    `Kie.ai ${stage} failed (HTTP ${response.status}, code ${code}): ${message}`.slice(0, 500),
    retryable && !uncertain,
    uncertain,
  )
}
