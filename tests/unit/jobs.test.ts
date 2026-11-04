import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleVideoJob } from '#/server/jobs'
import { getVideoProvider } from '#/server/video'
import type { VideoStatus } from '#/server/video/types'
import { d1Shim, migrate } from './d1-sqlite'

// 多步任务（yir 两步走）在轮询里进入下一步：jobs.ts 把新的服务商任务写回 generations，只写一次
const status = vi.fn<(requestId: string, meta: Record<string, unknown>) => Promise<VideoStatus>>()
vi.mock('#/server/video', () => ({ getVideoProvider: vi.fn(() => ({ id: 'yir', status, costCents: () => 0 })) }))
vi.mock('#/server/notifications', () => ({ notifyGenerationFinished: async () => {} }))

let sqlite: DatabaseSync
let sent: unknown[]
let env: Env

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  migrate(sqlite)
  sent = []
  env = { DB: d1Shim(sqlite), VIDEO_QUEUE: { send: async (message: unknown) => void sent.push(message) } } as unknown as Env
  const now = new Date().toISOString()
  sqlite.prepare('INSERT INTO users (id, email, credits, created_at) VALUES (?, ?, 0, ?)').run('usr_1', 'u@example.com', now)
  sqlite
    .prepare(
      `INSERT INTO generations (id, user_id, template_id, duration_id, duration_seconds, credits_cost, upload_id, status, provider,
       provider_request_id, provider_meta, created_at, updated_at) VALUES ('gen_1', 'usr_1', 't', 'short', 6, 6, 'upl_1', 'processing', 'yir', 'job_s', ?, ?, ?)`,
    )
    .run(JSON.stringify({ stage: 'scene' }), now, now)
  status.mockReset()
})

const row = () => sqlite.prepare('SELECT status, provider_request_id, provider_meta FROM generations WHERE id = ?').get('gen_1')
const advance = { state: 'pending', next: { requestId: 'job_v', meta: { stage: 'video', sceneCostCents: 1 } } } as const

describe('jobs：多步任务进入下一步', () => {
  it('provider 返回 next：之后轮询新任务，meta 换成下一步的', async () => {
    status.mockResolvedValue(advance)
    await handleVideoJob(env, { kind: 'poll', generationId: 'gen_1' })
    expect(status).toHaveBeenCalledWith('job_s', { stage: 'scene' })
    expect(row()).toEqual({ status: 'processing', provider_request_id: 'job_v', provider_meta: '{"stage":"video","sceneCostCents":1}' })
    expect(sent).toEqual([{ kind: 'poll', generationId: 'gen_1' }])
  })

  it('webhook 和定时轮询同时推进：晚到的一路按旧任务 id 抢占失败，不覆盖另一路写入的状态，也不多排一次轮询', async () => {
    status.mockImplementation(async () => {
      // 这一路查询期间，另一路已经推进并写入
      sqlite.prepare('UPDATE generations SET provider_request_id = ?, provider_meta = ? WHERE id = ?').run('job_v', '{"stage":"video"}', 'gen_1')
      return advance
    })
    await handleVideoJob(env, { kind: 'poll', generationId: 'gen_1' })
    expect(row()).toEqual({ status: 'processing', provider_request_id: 'job_v', provider_meta: '{"stage":"video"}' })
    expect(sent).toEqual([])
  })
})

describe('jobs：成片自动合成音轨', () => {
  it('合成后保存结果并标记成功', async () => {
    const video = await readFile(new URL('../fixtures/audio-mux/video.mp4', import.meta.url))
    const audio = await readFile(new URL('../fixtures/audio-mux/audio.m4a', import.meta.url))
    const put = vi.fn(async () => {})
    env.MEDIA = {
      get: async (key: string) => {
        const data = key === 'templates/audio.m4a' ? audio : video
        return { size: data.length, body: new Response(data).body }
      },
      put,
    } as unknown as R2Bucket
    sqlite.prepare("UPDATE generations SET provider = 'kie', provider_meta = ? WHERE id = 'gen_1'").run(JSON.stringify({ postprocessAudio: 'audio.m4a' }))
    status.mockResolvedValue({ state: 'completed', output: { r2Key: 'source.mp4' }, costCents: 10 })
    await handleVideoJob(env, { kind: 'poll', generationId: 'gen_1' })
    expect(put).toHaveBeenCalledOnce()
    expect(sqlite.prepare('SELECT status, provider_cost_cents FROM generations WHERE id = ?').get('gen_1')).toEqual({ status: 'succeeded', provider_cost_cents: 10 })
  })

  it('音轨暂时不可用时保留处理状态和成本，交给队列重试', async () => {
    env.MEDIA = { get: async () => null } as unknown as R2Bucket
    sqlite.prepare("UPDATE generations SET provider = 'kie', provider_meta = ? WHERE id = 'gen_1'").run(JSON.stringify({ postprocessAudio: 'missing.m4a' }))
    status.mockResolvedValue({ state: 'completed', output: { r2Key: 'source.mp4' }, costCents: 10 })
    await expect(handleVideoJob(env, { kind: 'poll', generationId: 'gen_1' })).rejects.toThrow('音轨不存在')
    expect(sqlite.prepare('SELECT status, provider_cost_cents FROM generations WHERE id = ?').get('gen_1')).toEqual({ status: 'processing', provider_cost_cents: 10 })
  })
})

describe('jobs：提交时按任务的风格找源视频', () => {
  it('风格已不在站点配置里：按 invalid_input 失败，不向 provider 提交', async () => {
    const submit = vi.fn()
    vi.mocked(getVideoProvider).mockReturnValueOnce({ id: 'yir', submit, status, costCents: () => 0 })
    sqlite.prepare("UPDATE generations SET status = 'queued', template_id = 'gone-v1', provider_request_id = NULL WHERE id = 'gen_1'").run()
    sqlite
      .prepare("INSERT INTO uploads (id, user_id, r2_key, content_type, size_bytes, sha256, created_at) VALUES ('upl_1', 'usr_1', 'k', 'image/jpeg', 1, 'h', ?)")
      .run(new Date().toISOString())
    await handleVideoJob(env, { kind: 'submit', generationId: 'gen_1' })
    expect(submit).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT status, error_code FROM generations WHERE id = ?').get('gen_1')).toEqual({ status: 'failed', error_code: 'invalid_input' })
  })
})
