import { describe, expect, it } from 'vitest'
import { LOCALES, STYLES, defaultStyle, findStyle, site } from '#/config/site'
import { loadContent } from '#/lib/i18n'

// 风格配置的一致性：加风格时漏掉文案、源视频或 id 重复，在这里就能发现
describe('site.styles', () => {
  it('至少一个风格，第一个是默认风格，id 不重复', () => {
    expect(STYLES.length).toBeGreaterThan(0)
    expect(defaultStyle).toBe(STYLES[0])
    const ids = STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(findStyle(id)?.id).toBe(id)
    expect(findStyle('no-such-style')).toBeUndefined()
  })

  it('保留每个输出时长对应的源视频、Kie 固定 14 秒参考片、旧 18 秒兼容片和三个展示素材', () => {
    for (const style of STYLES) {
      const files = site.durations.map((d) => style.sources[d.id])
      expect(files.every(Boolean)).toBe(true)
      expect(new Set(files).size).toBe(files.length)
      expect(style.sources.reference, `${style.id} 缺 Kie 的 14 秒参考视频`).toBeTruthy()
      expect(style.sources.legacyFull, `${style.id} 缺旧 18 秒任务的兼容源视频`).toBeTruthy()
      expect(style.examples.previews).toHaveLength(3)
      for (const clip of style.examples.previews) {
        expect(clip.label).toBeTruthy()
        expect(clip.video).toBeTruthy()
        expect(clip.poster).toBeTruthy()
        expect(clip.credit.trim()).toBeTruthy()
      }
    }
  })

  it('每个风格在每种语言都有展示名和介绍', async () => {
    for (const locale of LOCALES) {
      const content = await loadContent(locale)
      for (const style of STYLES) {
        const copy = (content.styles as Record<string, { name: string; tagline: string } | undefined>)[style.id]
        expect(copy?.name, `${locale}/${style.id}`).toBeTruthy()
        expect(copy?.tagline, `${locale}/${style.id}`).toBeTruthy()
      }
    }
  })
})
