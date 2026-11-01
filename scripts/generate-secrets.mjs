#!/usr/bin/env node
// 自动生成运行时密钥，避免手动创建弱密钥或忘记更改默认值
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseDotenv } from './sync-secrets.mjs'

const SECRETS_FILE = '.dev.vars.production'

// 需要自动生成的密钥配置
const AUTO_SECRETS = {
  SESSION_SECRET: {
    description: '会话密钥（用于签名 cookie 和 token）',
    generator: () => randomBytes(32).toString('hex'),
    required: true,
    pattern: /^[a-f0-9]{64}$/i,
    defaultValue: 'change-me-to-a-long-random-string',
  },
}

function isWeakSecret(key, value) {
  const config = AUTO_SECRETS[key]
  if (!config) return false

  // 检查是否是默认值
  if (config.defaultValue && value === config.defaultValue) return true

  // 检查是否符合强度要求
  if (config.pattern && !config.pattern.test(value)) return true

  // 检查长度
  if (value.length < 32) return true

  return false
}

function generateSecret(key) {
  const config = AUTO_SECRETS[key]
  if (!config || !config.generator) {
    throw new Error(`No generator configured for ${key}`)
  }
  return config.generator()
}

function updateSecretInFile(source, key, value) {
  const regex = new RegExp(`^(${key}=)(.*)$`, 'm')
  if (!regex.test(source)) {
    throw new Error(`Key ${key} not found in secrets file`)
  }
  return source.replace(regex, `$1${value}`)
}

export function analyzeSecrets(secretsPath) {
  if (!existsSync(secretsPath)) {
    throw new Error(`Secrets file not found: ${secretsPath}`)
  }

  const content = readFileSync(secretsPath, 'utf8')
  const parsed = parseDotenv(content)

  if (parsed.errors.length) {
    throw new Error('Invalid secrets file format')
  }

  const secrets = Object.fromEntries(parsed.entries)
  const analysis = {
    weak: [],
    missing: [],
    strong: [],
    canAutoGenerate: [],
  }

  for (const [key, config] of Object.entries(AUTO_SECRETS)) {
    const value = secrets[key] || ''

    if (!value) {
      analysis.missing.push({ key, ...config })
      if (config.generator) {
        analysis.canAutoGenerate.push(key)
      }
    } else if (isWeakSecret(key, value)) {
      analysis.weak.push({ key, value, ...config })
      if (config.generator) {
        analysis.canAutoGenerate.push(key)
      }
    } else {
      analysis.strong.push({ key })
    }
  }

  return analysis
}

export function generateSecrets(secretsPath, options = {}) {
  const { force = false, keysToGenerate = null } = options

  if (!existsSync(secretsPath)) {
    throw new Error(`Secrets file not found: ${secretsPath}`)
  }

  let content = readFileSync(secretsPath, 'utf8')
  const analysis = analyzeSecrets(secretsPath)
  const generated = []

  const keys = keysToGenerate || analysis.canAutoGenerate

  for (const key of keys) {
    const config = AUTO_SECRETS[key]
    if (!config || !config.generator) continue

    const parsed = parseDotenv(content)
    const secrets = Object.fromEntries(parsed.entries)
    const currentValue = secrets[key] || ''

    // 跳过已经是强密钥的
    if (!force && currentValue && !isWeakSecret(key, currentValue)) {
      continue
    }

    const newValue = generateSecret(key)
    content = updateSecretInFile(content, key, newValue)
    generated.push({ key, description: config.description })
  }

  return { content, generated }
}

function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--apply') ? 'apply' : args.includes('--check') ? 'check' : 'plan'
  const force = args.includes('--force')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🔐 密钥生成器`)
  console.log(`模式: ${mode === 'apply' ? '执行（写入文件）' : mode === 'check' ? '检查安全性' : '计划（仅查看）'}`)
  console.log(`${'='.repeat(60)}\n`)

  try {
    const analysis = analyzeSecrets(SECRETS_FILE)

    // 显示分析结果
    if (analysis.strong.length > 0) {
      console.log(`✅ 强密钥 (${analysis.strong.length})：`)
      for (const { key } of analysis.strong) {
        console.log(`   ${key}`)
      }
      console.log()
    }

    if (analysis.weak.length > 0) {
      console.log(`⚠️  弱密钥 (${analysis.weak.length})：`)
      for (const { key, value, description } of analysis.weak) {
        console.log(`   ${key}: ${description}`)
        console.log(`      当前值: ${value.substring(0, 20)}...`)
      }
      console.log()
    }

    if (analysis.missing.length > 0) {
      console.log(`❌ 缺失密钥 (${analysis.missing.length})：`)
      for (const { key, description } of analysis.missing) {
        console.log(`   ${key}: ${description}`)
      }
      console.log()
    }

    // check 模式：只检查安全性
    if (mode === 'check') {
      const issues = analysis.weak.length + analysis.missing.length
      if (issues > 0) {
        console.log(`\n⚠️  发现 ${issues} 个安全问题`)
        console.log(`\n运行以下命令修复：`)
        console.log(`  node scripts/generate-secrets.mjs --apply`)
        process.exit(1)
      } else {
        console.log(`\n✅ 所有密钥安全`)
        process.exit(0)
      }
    }

    // 生成密钥
    if (analysis.canAutoGenerate.length > 0) {
      console.log(`🔑 可自动生成的密钥 (${analysis.canAutoGenerate.length})：`)
      for (const key of analysis.canAutoGenerate) {
        const config = AUTO_SECRETS[key]
        console.log(`   ${key}: ${config.description}`)
      }
      console.log()

      if (mode === 'apply') {
        const result = generateSecrets(SECRETS_FILE, { force })

        if (result.generated.length > 0) {
          writeFileSync(SECRETS_FILE, result.content, { mode: 0o600 })
          console.log(`✅ 已生成 ${result.generated.length} 个密钥：`)
          for (const { key, description } of result.generated) {
            console.log(`   ${key}: ${description}`)
          }
          console.log(`\n✅ 已写入 ${SECRETS_FILE}`)
        } else {
          console.log(`ℹ️  没有需要生成的密钥（使用 --force 强制重新生成）`)
        }
      } else {
        console.log(`ℹ️  运行以下命令生成：`)
        console.log(`  node scripts/generate-secrets.mjs --apply`)
      }
    } else {
      console.log(`ℹ️  没有可自动生成的密钥`)
    }

  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-secrets.mjs')) {
  main()
}
