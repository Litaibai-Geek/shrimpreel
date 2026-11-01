#!/usr/bin/env node
// 公开配置统一由 setup 管理；不要用本地开发变量覆盖生产店铺配置。
import { main } from './bootstrap-site.mjs'

if (process.argv.includes('--apply')) {
  console.error('请改用 npm run setup -- --plan 查看配置，再使用 npm run setup -- --apply 初始化。')
  process.exitCode = 1
} else {
  console.log('公开配置以 site.setup.json 为准，以下为离线初始化计划：')
  Promise.resolve(main(['--plan'])).then((code) => { process.exitCode = code })
}
