import { describe, expect, it } from 'vitest'
import { requiredAssets, syncAssets } from '../../scripts/seed-remote.mjs'

describe('生产模板素材初始化', () => {
  const assets = [
    { name: 'reference.mp4', path: 'reference.mp4', type: 'video/mp4', hash: 'hash-a' },
    { name: 'music.m4a', path: 'music.m4a', type: 'audio/mp4', hash: 'hash-b' },
  ]

  it('先核对所有远端文件，缺失的才上传并验证', () => {
    const remote: Record<string, string> = { 'reference.mp4': 'hash-a' }
    const uploaded: string[] = []
    const result = syncAssets(assets, (asset) => remote[asset.name] ?? null, (asset) => { uploaded.push(asset.name); remote[asset.name] = asset.hash }, true)
    expect(uploaded).toEqual(['music.m4a'])
    expect(result).toEqual({ existing: 1, uploaded: 1 })
  })

  it('遇到同名不同内容时不上传任何文件', () => {
    const uploaded: string[] = []
    expect(() => syncAssets(assets, (asset) => asset.name === 'music.m4a' ? 'different' : null, (asset) => uploaded.push(asset.name), true)).toThrow('拒绝覆盖')
    expect(uploaded).toEqual([])
  })

  it('只读检查发现缺失时不上传', () => {
    const uploaded: string[] = []
    expect(() => syncAssets(assets, () => null, (asset) => uploaded.push(asset.name), false)).toThrow('缺少模板素材')
    expect(uploaded).toEqual([])
  })

  it('上传后再次校验内容，不把未写入或错误内容报告为成功', () => {
    expect(() => syncAssets(assets.slice(0, 1), () => null, () => {}, true)).toThrow('上传后生产素材校验失败')
  })

  it('Kie 素材校验拒绝目录穿越和缺少的本地参考视频', () => {
    const config = { vars: { VIDEO_PROVIDER: 'kie' } }
    const makeSite = (reference: string) => ({ styles: [{ sources: { reference } }], durations: [], video: { kie: { postprocessAudio: null } } })
    expect(() => requiredAssets(config, makeSite('../other.mp4'))).toThrow('文件名无效')
    expect(() => requiredAssets(config, makeSite('missing-reference.mp4'))).toThrow('缺少本地模板素材')
  })
})
