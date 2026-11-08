#!/usr/bin/env node
// 检查并补齐当前视频服务商需要的生产素材；不覆盖已有对象。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { site } from '../src/config/site.ts'
import { readWranglerConfig } from './doctor.mjs'

const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.m4a': 'audio/mp4', '.aac': 'audio/aac' }
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** @param {{vars?: {VIDEO_PROVIDER?: string}}} config
 * @param {{styles: readonly {sources: Readonly<Record<string, string>>, scene?: {frame: string} | null}[], durations: readonly {id: string}[], video: {kie: {generateAudio?: boolean, postprocessAudio?: string | null}}}} siteConfig */
export function requiredAssets(config, siteConfig = site) {
  const provider = config.vars?.VIDEO_PROVIDER
  if (!['kie', 'fal', 'yir', 'nanoapi'].includes(provider)) throw new Error('无法确定生产视频服务商')
  const names = []
  for (const style of siteConfig.styles) {
    if (provider === 'kie') names.push(style.sources.reference)
    else {
      for (const duration of siteConfig.durations) names.push(style.sources[duration.id])
      if (style.sources.legacyFull) names.push(style.sources.legacyFull)
      if (provider === 'yir' && style.scene?.frame) names.push(style.scene.frame)
    }
  }
  const audio = provider === 'kie' ? siteConfig.video.kie.postprocessAudio : null
  if (audio && siteConfig.video.kie.generateAudio) throw new Error('启用后期音轨时必须关闭 Kie 原生音频生成')
  if (audio) names.push(audio)
  return [...new Set(names)].map((name) => {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error('模板素材文件名无效')
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (!TYPES[extension]) throw new Error('不支持的模板素材类型：' + name)
    const path = join('seed', 'templates', name)
    if (!existsSync(path)) throw new Error('缺少本地模板素材：' + path)
    const bytes = readFileSync(path)
    if (!bytes.length || (name === audio && bytes.length > 4 * 1024 * 1024)) throw new Error('模板素材为空或音轨超过 4 MiB：' + name)
    return { name, path, type: TYPES[extension], hash: digest(bytes) }
  })
}

// 先检查所有对象，再上传缺失对象；已存在但内容不同的对象需要人工核对。
/** @param {{name: string, path: string, type: string, hash: string}[]} assets
 * @param {(asset: {name: string, path: string, type: string, hash: string}) => string | null} readRemote
 * @param {(asset: {name: string, path: string, type: string, hash: string}) => void} upload
 * @param {boolean} apply */
export function syncAssets(assets, readRemote, upload, apply) {
  const missing = []
  for (const asset of assets) {
    const remote = readRemote(asset)
    if (remote === null) missing.push(asset)
    else if (remote !== asset.hash) throw new Error('生产 R2 已有同名但内容不同的素材，拒绝覆盖：' + asset.name)
  }
  if (!apply && missing.length) throw new Error('生产 R2 缺少模板素材：' + missing.map((asset) => asset.name).join('、'))
  for (const asset of missing) {
    upload(asset)
    if (readRemote(asset) !== asset.hash) throw new Error('上传后生产素材校验失败：' + asset.name)
  }
  return { existing: assets.length - missing.length, uploaded: missing.length }
}

export function main(args = process.argv.slice(2), log = console.log) {
  let tempFile, tempDir
  try {
    const apply = args.includes('--apply'), verify = args.includes('--verify')
    if (apply && verify) throw new Error('只能选择 --apply 或 --verify')
    const index = args.indexOf('--config')
    const configPath = index < 0 ? 'wrangler.jsonc' : args[index + 1]
    if (!configPath || configPath.startsWith('--')) throw new Error('缺少 Wrangler 配置文件')
    const config = readWranglerConfig(configPath)
    const bucket = config.r2_buckets?.find((item) => item.binding === 'MEDIA')?.bucket_name
    if (!bucket || !/^[a-z0-9][a-z0-9-]*$/.test(bucket)) throw new Error('MEDIA R2 bucket 配置无效')
    const assets = requiredAssets(config)
    if (!apply && !verify) { log('生产素材预览（未联网、未上传）：' + assets.map((a) => a.name).join('、')); return 0 }
    mkdirSync('.tmp', { recursive: true })
    tempDir = mkdtempSync(join('.tmp', 'seed-remote-'))
    tempFile = join(tempDir, 'object')
    const run = (argv) => spawnSync(process.execPath, ['scripts/wrangler-platform.mjs', ...argv, '-c', configPath], { encoding: 'utf8' })
    const result = syncAssets(assets, (asset) => {
      const outcome = run(['r2', 'object', 'get', `${bucket}/templates/${asset.name}`, '--remote', '--file', tempFile])
      if (outcome.status !== 0) {
        if (/The specified key does not exist\./i.test((outcome.stdout ?? '') + (outcome.stderr ?? ''))) return null
        throw new Error('无法读取生产 R2 素材：' + asset.name)
      }
      const hash = digest(readFileSync(tempFile))
      unlinkSync(tempFile)
      return hash
    }, (asset) => {
      const outcome = run(['r2', 'object', 'put', `${bucket}/templates/${asset.name}`, '--remote', '--file', asset.path, '--content-type', asset.type])
      if (outcome.status !== 0) throw new Error('上传生产 R2 素材失败：' + asset.name)
    }, apply)
    log(`生产素材检查完成：复用 ${result.existing} 个，上传 ${result.uploaded} 个`)
    return 0
  } catch (error) {
    log('✗ ' + (error instanceof Error ? error.message : '生产素材检查失败'))
    return 1
  } finally {
    if (tempFile && existsSync(tempFile)) unlinkSync(tempFile)
    if (tempDir && existsSync(tempDir)) rmdirSync(tempDir)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main()
