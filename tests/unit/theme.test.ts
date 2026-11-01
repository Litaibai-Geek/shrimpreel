import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { site } from '#/config/site'
import { THEMES, THEME_COLOR } from '#/lib/theme'

const css = readFileSync('src/styles.css', 'utf8')

// studio 主题用 :root 和 [data-theme='dark'] 定义亮色和暗色
describe('主题', () => {
  it('site.theme 是已登记的主题', () => {
    expect(THEMES).toContain(site.theme)
  })

  it('studio 主题在 styles.css 里同时定义了亮色和暗色', () => {
    expect(css).toContain(':root {')
    expect(css).toContain("[data-theme='dark'] {")
    expect(THEME_COLOR.studio).toMatch(/^#[0-9a-f]{6}$/)
  })
})
