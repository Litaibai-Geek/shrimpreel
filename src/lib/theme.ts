// 主题：site.theme 选一套，写在 <html data-skin>；颜色、字体、圆角在 src/styles.css 的 [data-skin] 里定义。
// 亮色 / 暗色由 data-theme 另外控制（访客切换），每套主题都要同时定义两种
//   studio：灰白背景 + 橙红强调、Inter 字体、圆润卡片
export const THEMES = ['studio'] as const
export type ThemeName = (typeof THEMES)[number]

// <meta name="theme-color">（手机浏览器地址栏颜色），取各主题亮色模式的背景
export const THEME_COLOR: Record<ThemeName, string> = {
  studio: '#ecedee',
}
