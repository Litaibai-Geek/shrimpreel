import { readFile } from 'node:fs/promises'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { MAX_MUX_VIDEO_BYTES, muxAudio } from '#/server/audio-mux'

const fixture = (name: string) => readFile(new URL(`../fixtures/audio-mux/${name}`, import.meta.url))

describe('成片音轨合成', () => {
  it('保留视频并添加 AAC 音轨，音频按视频长度裁剪', async () => {
    const result = await muxAudio(await fixture('video.mp4'), await fixture('audio.m4a'))
    const input = new Input({ source: new BufferSource(result), formats: ALL_FORMATS })
    const video = await input.getPrimaryVideoTrack()
    const audio = await input.getPrimaryAudioTrack()
    expect(video?.codec).toBe('avc')
    expect(audio?.codec).toBe('aac')
    expect(await video?.computeDuration()).toBeCloseTo(1, 1)
    expect(await audio?.computeDuration()).toBeLessThan(1.1)
    input.dispose()
  })

  it('拒绝过大文件以及没有音轨的素材', async () => {
    const video = await fixture('video.mp4')
    await expect(muxAudio(new Uint8Array(MAX_MUX_VIDEO_BYTES + 1), video)).rejects.toThrow('大小限制')
    await expect(muxAudio(video, video)).rejects.toThrow('缺少音轨')
  })
})
