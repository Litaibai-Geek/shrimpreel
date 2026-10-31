import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultStyle } from '#/config/site'
import { createKieProvider, estimatedCostCents } from '#/server/video/kie'

const env = (vars: Record<string, string> = {}) => ({ KIE_API_KEY: 'kie_test_key', ...vars }) as unknown as Env
const input = (webhookUrl = 'https://tinydeskai.website/api/webhooks/kie?gen=gen_1&token=t') => ({
  generationId: 'gen_1',
  style: { ...defaultStyle, prompt: null },
  durationSeconds: 15,
  imageUrl: 'https://tinydeskai.website/media/uploads/upl_1?exp=1&sig=s',
  sourceVideoUrl: 'https://tinydeskai.website/media/templates/tiny-desk-v1-15s.mp4',
  sourceVideoKey: 'templates/tiny-desk-v1-15s.mp4',
  webhookUrl,
  meta: {},
})

const ok = (data: unknown) => new Response(JSON.stringify({ code: 200, msg: 'success', data }), { status: 200 })
const error = (code: number, msg = `code ${code}`) => new Response(JSON.stringify({ code, msg }), { status: 200 })

function stubFetch(routes: Record<string, () => Response>) {
  const calls: Array<{ method: string; url: URL; body: Record<string, unknown> | null; headers: Headers }> = []
  vi.stubGlobal('fetch', async (raw: string, init?: RequestInit) => {
    const url = new URL(raw)
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init?.headers),
    })
    const route = routes[`${method} ${url.pathname}`]
    if (!route) throw new Error(`unexpected fetch ${method} ${url.pathname}`)
    return route()
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('Kie.ai Seedance 2.0 Mini：提交', () => {
  it('一张人像 + 内置动作视频按 multimodal reference 模式提交，固定 720p / 9:16 / 15 秒', async () => {
    const calls = stubFetch({ 'POST /api/v1/jobs/createTask': () => ok({ taskId: 'task_kie_1' }) })
    const result = await createKieProvider(env()).submit(input())
    expect(result).toEqual({ requestId: 'task_kie_1', meta: {} })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer kie_test_key')
    expect(calls[0]!.body).toMatchObject({
      model: 'bytedance/seedance-2-mini',
      callBackUrl: input().webhookUrl,
      input: {
        reference_image_urls: [input().imageUrl],
        reference_video_urls: [input().sourceVideoUrl],
        resolution: '720p',
        aspect_ratio: '9:16',
        duration: 15,
        generate_audio: true,
      },
    })
    expect(calls[0]!.body!.input).not.toHaveProperty('first_frame_url')
    expect(calls[0]!.body!.input).not.toHaveProperty('last_frame_url')
    expect(String((calls[0]!.body!.input as Record<string, unknown>).prompt)).toContain('Image 1')
    expect(String((calls[0]!.body!.input as Record<string, unknown>).prompt)).toContain('Video 1')
  })

  it('本地 HTTP 环境不发送无法访问的 callback URL，依靠任务轮询', async () => {
    const calls = stubFetch({ 'POST /api/v1/jobs/createTask': () => ok({ taskId: 'task_local' }) })
    await createKieProvider(env()).submit(input('http://localhost:3000/api/webhooks/kie?gen=gen_1&token=t'))
    expect(calls[0]!.body).not.toHaveProperty('callBackUrl')
  })

  it('没有 taskId 或 prompt / duration 超出模型限制时拒绝提交', async () => {
    stubFetch({ 'POST /api/v1/jobs/createTask': () => ok({}) })
    await expect(createKieProvider(env()).submit(input())).rejects.toMatchObject({ code: 'kie_submit_no_task_id', retryable: false })
    const invalidPrompt = { ...input(), style: { ...defaultStyle, prompt: 'x' } }
    await expect(createKieProvider(env()).submit(invalidPrompt)).rejects.toMatchObject({ code: 'kie_invalid_prompt', retryable: false })
    await expect(createKieProvider(env()).submit({ ...input(), durationSeconds: 18 })).rejects.toMatchObject({ code: 'kie_invalid_duration', retryable: false })
  })

  it('HTTP 200 业务错误也按 code 处理；401 / 402 失败退款，429 重试，500 等回调确认', async () => {
    const cases = [
      [401, 'kie_unauthorized', false],
      [402, 'kie_insufficient_credits', false],
      [429, 'kie_rate_limited', true],
      [500, 'kie_submit_500', false],
    ] as const
    for (const [code, expectedCode, retryable] of cases) {
      stubFetch({ 'POST /api/v1/jobs/createTask': () => error(code) })
      await expect(createKieProvider(env()).submit(input())).rejects.toMatchObject({
        code: expectedCode,
        retryable,
        ...(code === 500 ? { uncertain: true } : {}),
        message: expect.stringContaining(`code ${code}`),
      })
    }
  })

  it('提交网络错误视为结果不确定，不自动重试创建任务；状态查询网络错误仍可重试', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('connection reset')
    })
    await expect(createKieProvider(env()).submit(input())).rejects.toMatchObject({
      code: 'kie_submit_network',
      retryable: false,
      uncertain: true,
    })
    await expect(createKieProvider(env()).status('task_1', {})).rejects.toMatchObject({
      code: 'kie_status_network',
      retryable: true,
      uncertain: false,
    })
  })

  it('未配置 KIE_API_KEY 时不请求上游', async () => {
    const calls = stubFetch({})
    await expect(createKieProvider(env({ KIE_API_KEY: '' })).submit(input())).rejects.toMatchObject({
      code: 'provider_not_configured',
      retryable: false,
    })
    expect(calls).toHaveLength(0)
  })
})

describe('Kie.ai Seedance 2.0 Mini：查询', () => {
  it('waiting / queuing / generating 保持处理中', async () => {
    for (const state of ['waiting', 'queuing', 'generating']) {
      stubFetch({ 'GET /api/v1/jobs/recordInfo': () => ok({ taskId: 'task_1', state }) })
      await expect(createKieProvider(env()).status('task_1', {})).resolves.toEqual({ state: 'pending' })
    }
  })

  it('成功时解析 resultJson，并优先按 creditsConsumed 记录实际成本', async () => {
    stubFetch({
      'GET /api/v1/jobs/recordInfo': () =>
        ok({
          taskId: 'task_1',
          state: 'success',
          resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie.ai/result.mp4'] }),
          creditsConsumed: 150,
        }),
    })
    await expect(createKieProvider(env()).status('task_1', {})).resolves.toEqual({
      state: 'completed',
      output: { url: 'https://cdn.kie.ai/result.mp4' },
      costCents: 75,
    })
  })

  it('成功但没有 HTTPS 视频地址视为失败；上游 fail 映射错误码和消息', async () => {
    stubFetch({ 'GET /api/v1/jobs/recordInfo': () => ok({ taskId: 'task_1', state: 'success', resultJson: '{}' }) })
    await expect(createKieProvider(env()).status('task_1', {})).resolves.toMatchObject({ state: 'failed', code: 'kie_no_video' })
    stubFetch({
      'GET /api/v1/jobs/recordInfo': () => ok({ taskId: 'task_1', state: 'fail', failCode: 'CONTENT_POLICY', failMsg: 'Input rejected' }),
    })
    await expect(createKieProvider(env()).status('task_1', {})).resolves.toEqual({
      state: 'failed',
      code: 'kie_content_policy',
      message: 'Input rejected',
    })
  })

  it('成本估算按 14 秒输入参考视频 + 输出视频计费：6 / 12 / 15 秒约 $0.50 / $0.65 / $0.73', () => {
    expect([6, 12, 15].map(estimatedCostCents)).toEqual([50, 65, 73])
  })

  it('任务查询错误处理 HTTP 200 的业务错误码', async () => {
    stubFetch({ 'GET /api/v1/jobs/recordInfo': () => error(401, 'invalid key') })
    await expect(createKieProvider(env()).status('task_1', {})).rejects.toMatchObject({ code: 'kie_unauthorized', retryable: false })
    stubFetch({ 'GET /api/v1/jobs/recordInfo': () => new Response('bad gateway', { status: 502 }) })
    await expect(createKieProvider(env()).status('task_1', {})).rejects.toMatchObject({ code: 'kie_status_502', retryable: true })
  })
})
