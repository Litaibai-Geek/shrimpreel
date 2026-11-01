#!/usr/bin/env node
// 批量初始化多个热词站，每个站点自动创建独立的 Turnstile
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// 配置所有热词站的路径
const SITES = [
  { name: 'tinydeskai', path: ROOT },
  { name: 'another-site', path: resolve(ROOT, '../another-site') },
  // 添加更多站点...
]

function run(command, args, cwd) {
  console.log(`\n🔨 执行: ${command} ${args.join(' ')}`)
  console.log(`📂 目录: ${cwd}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: true,
  })
  if (result.status !== 0) {
    throw new Error(`命令失败: ${command} ${args.join(' ')}`)
  }
}

function checkPrerequisites(sitePath) {
  const required = [
    'site.setup.json',
    'wrangler.jsonc',
    '.dev.vars.production',
  ]
  for (const file of required) {
    const path = resolve(sitePath, file)
    if (!existsSync(path)) {
      throw new Error(`缺少必需文件: ${file} in ${sitePath}`)
    }
  }

  // 检查 site.setup.json 是否启用了 Turnstile
  const setup = JSON.parse(readFileSync(resolve(sitePath, 'site.setup.json'), 'utf8'))
  if (!setup.platforms?.cloudflare?.turnstile) {
    console.warn(`⚠️  ${sitePath}: site.setup.json 未启用 Turnstile`)
  }
}

async function setupSite(site, mode) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🚀 处理站点: ${site.name}`)
  console.log(`📂 路径: ${site.path}`)
  console.log(`${'='.repeat(60)}`)

  if (!existsSync(site.path)) {
    console.error(`❌ 站点路径不存在: ${site.path}`)
    return false
  }

  try {
    checkPrerequisites(site.path)

    if (mode === 'plan') {
      run('npm', ['run', 'setup', '--', '--plan'], site.path)
    } else if (mode === 'apply') {
      // 1. 初始化资源（包括 Turnstile）
      run('npm', ['run', 'setup', '--', '--apply'], site.path)

      // 2. 应用数据库迁移
      run('npm', ['run', 'db:migrate:remote'], site.path)

      // 3. 验证
      run('npm', ['run', 'setup', '--', '--verify'], site.path)

      console.log(`\n✅ ${site.name} 初始化完成！`)
    }

    return true
  } catch (error) {
    console.error(`\n❌ ${site.name} 失败:`, error.message)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--apply') ? 'apply' : 'plan'

  console.log(`\n${'='.repeat(60)}`)
  console.log(`📋 批量站点初始化`)
  console.log(`模式: ${mode === 'apply' ? '执行' : '计划（仅查看）'}`)
  console.log(`站点数量: ${SITES.length}`)
  console.log(`${'='.repeat(60)}`)

  // 检查 .dev.vars.platform
  const platformVars = resolve(ROOT, '.dev.vars.platform')
  if (!existsSync(platformVars)) {
    console.error(`\n❌ 缺少 .dev.vars.platform 文件`)
    console.error(`请先创建该文件并配置 CLOUDFLARE_API_TOKEN`)
    process.exit(1)
  }

  const results = []
  for (const site of SITES) {
    const success = await setupSite(site, mode)
    results.push({ site: site.name, success })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`📊 执行结果`)
  console.log(`${'='.repeat(60)}`)

  for (const { site, success } of results) {
    console.log(`${success ? '✅' : '❌'} ${site}`)
  }

  const failed = results.filter(r => !r.success).length
  if (failed > 0) {
    console.log(`\n⚠️  ${failed} 个站点失败`)
    process.exit(1)
  } else {
    console.log(`\n🎉 所有站点初始化成功！`)
  }
}

main().catch((error) => {
  console.error('❌ 批量初始化失败:', error)
  process.exit(1)
})
