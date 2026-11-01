#!/usr/bin/env node
// Safe Cloudflare-first launch bootstrap. No deploy, destructive commands or
// existing-secret overwrites. The default --plan never calls a remote API.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { site } from '../src/config/site.ts'
import { parseDotenv } from './sync-secrets.mjs'
import { parsePendingMigrations, parseSecretNames } from './doctor.mjs'

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const KV_ID = /^[0-9a-f]{32}$/i
const isPlaceholder = (value) => /^0+(?:-0+)*$/.test(value ?? '')
const safeSecretPath = (path) => /^\.dev\.vars\.[A-Za-z0-9_-]+$/.test(path)

function runChild(file, args, env) {
  const r = spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8', env: env ?? process.env, maxBuffer: 10 * 1024 * 1024,
  })
  // Never relay raw output: even a CLI error can contain a credential.
  return { ok: r.status === 0, output: (r.stdout ?? '') + '\n' + (r.stderr ?? '') }
}

export function parseList(text) {
  // Wrangler sometimes emits an update notice before its JSON response.
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('Wrangler did not return a JSON list')
  let json
  try { json = JSON.parse(text.slice(start, end + 1)) }
  catch { throw new Error('Wrangler returned an unreadable JSON list') }
  if (!Array.isArray(json)) throw new Error('Expected a JSON array')
  return json
}

export function validateSetup(setup, wrangler, siteDomain = site.domain) {
  if (!setup || typeof setup !== 'object') throw new Error('Invalid site.setup.json')
  const s = setup.site ?? {}
  if (typeof s.name !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(s.name)) {
    throw new Error('site.name must be a lowercase Worker name')
  }
  if (s.name !== wrangler.name) throw new Error('Worker name differs from wrangler.jsonc; run new-site.mjs first')
  if (typeof s.domain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.domain)) {
    throw new Error('site.domain is invalid')
  }
  if (s.domain !== siteDomain) throw new Error('site.domain differs from src/config/site.ts; run new-site.mjs first')
  const resources = wrangler.d1_databases?.find((d) => d.binding === 'DB')
  const bucket = wrangler.r2_buckets?.find((b) => b.binding === 'MEDIA')
  const kv = wrangler.kv_namespaces?.find((k) => k.binding === 'KV')
  const queue = wrangler.queues?.producers?.find((q) => q.binding === 'VIDEO_QUEUE')
  if (!resources || !bucket || !kv || !queue || !wrangler.queues?.consumers?.some((q) => q.queue === queue.queue)) {
    throw new Error('Required D1, R2, KV or Queue bindings are missing')
  }
  if (!wrangler.queues.consumers.some((q) => q.queue === queue.queue && q.dead_letter_queue)) {
    throw new Error('The video queue needs a dead-letter queue')
  }
  const payment = setup.payment ?? {}
  if (payment.provider && payment.provider !== 'waffo') throw new Error('V1 payment automation supports Waffo only')
  if (payment.createProducts && (!/^STO_[A-Za-z0-9_-]+$/.test(payment.storeId ?? '') || !['test','prod'].includes(payment.environment))) {
    throw new Error('Waffo product setup requires a store ID (STO_...) and test/prod environment')
  }
  if (s.adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.adminEmail)) throw new Error('Invalid admin email')
  const video = setup.video?.provider
  if (video !== undefined && !['fal', 'yir', 'nanoapi', 'kie'].includes(video)) throw new Error('video.provider must be fal, yir, nanoapi or kie')
  const moderation = setup.moderation?.provider
  if (moderation !== undefined && !['openai', 'none'].includes(moderation)) throw new Error('moderation.provider must be openai or none')
  const from = setup.email?.from
  if (from != null && (typeof from !== 'string' || (from !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)))) throw new Error('Invalid email.from')
  if (setup.email?.loginEnabled !== undefined && typeof setup.email.loginEnabled !== 'boolean') throw new Error('email.loginEnabled must be true or false')
  return { database: resources.database_name, bucket: bucket.bucket_name,
    namespace: s.name + '-kv', queue: queue.queue,
    dlq: wrangler.queues.consumers.find((q) => q.queue === queue.queue).dead_letter_queue }
}

// 站点身份以现有站点配置为准；旧版显式字段仍会校验，避免静默部署到错误站点。
export function normalizeSetup(setup, wrangler, siteDomain = site.domain) {
  return { ...setup, site: { ...setup.site, name: setup.site?.name || wrangler.name,
    domain: setup.site?.domain || siteDomain } }
}

export function updatePublicVar(source, key, value) {
  const file = ts.parseJsonText('wrangler.jsonc', source)
  if (file.parseDiagnostics.length) throw new Error('Invalid wrangler.jsonc')
  const root = file.statements[0]?.expression
  if (!root || !ts.isObjectLiteralExpression(root)) throw new Error('Invalid wrangler.jsonc')
  const vars = root.properties.filter((p) => ts.isPropertyAssignment(p) && p.name.text === 'vars')
  if (vars.length !== 1 || !ts.isObjectLiteralExpression(vars[0].initializer)) throw new Error('Expected exactly one vars object')
  const object = vars[0].initializer
  const hits = object.properties.filter((p) => ts.isPropertyAssignment(p) && p.name.text === key)
  if (hits.length > 1) throw new Error('Duplicate var: ' + key)
  if (hits.length === 1) {
    const current = hits[0].initializer
    if (!ts.isStringLiteral(current)) throw new Error('Expected string var: ' + key)
    return source.slice(0, current.getStart(file)) + JSON.stringify(value) + source.slice(current.end)
  }
  const at = object.getStart(file) + 1
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return source.slice(0, at) + newline + '    ' + JSON.stringify(key) + ': ' + JSON.stringify(value) + (object.properties.length ? ',' : '') + source.slice(at)
}

export function updateResourceId(source, kind, id) {
  const regex = kind === 'd1'
    ? /("database_id"\s*:\s*)"[^"]*"/g
    : /("binding"\s*:\s*"KV"\s*,\s*"id"\s*:\s*)"[^"]*"/g
  const hits = [...source.matchAll(regex)]
  if (hits.length !== 1) throw new Error('Expected exactly one ' + kind + ' resource')
  if (!(kind === 'd1' ? UUID : KV_ID).test(id)) throw new Error('Invalid ' + kind + ' ID returned')
  return source.replace(regex, (_, prefix) => prefix + JSON.stringify(id))
}

function parsedConfig(text) {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', text)
  if (parsed.error) throw new Error('Invalid wrangler.jsonc')
  return parsed.config
}

function changedVars(original, draft) {
  const currentVars = parsedConfig(original).vars ?? {}
  const expectedVars = parsedConfig(draft).vars ?? {}
  return Object.keys(expectedVars).filter((key) => expectedVars[key] !== currentVars[key])
}

function findNamed(rows, name, key) {
  const matches = rows.filter((row) => row && row[key] === name)
  if (matches.length > 1) throw new Error('Multiple remote resources share the same name: ' + name)
  return matches[0] ?? null
}

export function cloudflareCommands(config) {
  const d1 = config.d1_databases.find((d) => d.binding === 'DB')
  const bucket = config.r2_buckets.find((b) => b.binding === 'MEDIA')
  const queue = config.queues.producers.find((q) => q.binding === 'VIDEO_QUEUE')
  const dlq = config.queues.consumers.find((q) => q.queue === queue.queue).dead_letter_queue
  return {
    d1: d1.database_name,
    bucket: bucket.bucket_name,
    kv: config.name + '-kv',
    queues: [...new Set([queue.queue, dlq])],
    oldD1: d1.database_id,
    oldKv: config.kv_namespaces.find((k) => k.binding === 'KV').id,
  }
}

export async function ensureCloudflare({ configText, run, apply, write, log }) {
  let text = configText
  const config = parsedConfig(text)
  const names = cloudflareCommands(config)
  const call = (args) => {
    const res = run(args)
    if (!res?.ok) throw new Error('Cloudflare command failed: ' + args.slice(0, 3).join(' ') + ' (check Wrangler login/permissions)')
    return res.output
  }
  const d1List = () => parseList(call(['d1', 'list', '--json']))
  let db = findNamed(d1List(), names.d1, 'name')
  if (!db) {
    if (!apply) throw new Error('Missing D1: ' + names.d1)
    log('创建 D1: ' + names.d1)
    call(['d1', 'create', names.d1])
    db = findNamed(d1List(), names.d1, 'name')
  }
  const d1Id = db?.uuid ?? db?.id
  if (!UUID.test(d1Id ?? '')) throw new Error('D1 UUID could not be verified, config unchanged')
  if (UUID.test(names.oldD1 ?? '') && !isPlaceholder(names.oldD1) && names.oldD1 !== d1Id) {
    throw new Error('Configured D1 ID differs from remote database. Refusing to overwrite')
  }
  text = updateResourceId(text, 'd1', d1Id)
  if (apply && text !== configText) write(text)
  log('D1 已验证: ' + names.d1)

  const kvList = () => parseList(call(['kv', 'namespace', 'list']))
  let namespace = findNamed(kvList(), names.kv, 'title')
  if (!namespace) {
    if (!apply) throw new Error('Missing KV: ' + names.kv)
    log('创建 KV: ' + names.kv)
    call(['kv', 'namespace', 'create', names.kv])
    namespace = findNamed(kvList(), names.kv, 'title')
  }
  const kvId = namespace?.id
  if (!KV_ID.test(kvId ?? '')) throw new Error('KV namespace ID could not be verified')
  if (KV_ID.test(names.oldKv ?? '') && !isPlaceholder(names.oldKv) && names.oldKv !== kvId) {
    throw new Error('Configured KV ID differs from remote namespace. Refusing to overwrite')
  }
  const updated = updateResourceId(text, 'kv', kvId)
  if (apply && updated !== text) write(updated)
  text = updated
  log('KV 已验证: ' + names.kv)

  // R2 and Queues have name-addressed "info" commands, avoiding brittle table parsers.
  const checkOrCreate = (info, create, label) => {
    let result = run(info)
    if (!result.ok) {
      if (!/\b404\b|not found|does not exist|could not find/i.test(result.output)) {
        throw new Error(label + ': unable to verify resource (not a confirmed 404)')
      }
      if (!apply) throw new Error(label + ': resource missing')
      log('创建 ' + label)
      call(create)
      result = run(info)
      if (!result.ok) throw new Error(label + ': created but verification failed')
    }
    log(label + ' 已验证')
  }
  checkOrCreate(['r2', 'bucket', 'info', names.bucket, '--json'], ['r2', 'bucket', 'create', names.bucket], 'R2 ' + names.bucket)
  for (const queue of names.queues) {
    checkOrCreate(['queues', 'info', queue], ['queues', 'create', queue], 'Queue ' + queue)
  }
  return text
}

export function planDescription(setup, config) {
  const names = cloudflareCommands(config)
  return [
    'Cloudflare: D1 ' + names.d1 + ', R2 ' + names.bucket + ', KV ' + names.kv,
    'Queues: ' + names.queues.join(', '),
    'Worker vars: SITE_URL, ADMIN_EMAILS, GOOGLE_CLIENT_ID, 支付、视频、审核和发信配置',
    'Waffo 商品: ' + (setup.payment?.createProducts ? '创建缺失商品（' + setup.payment.environment + '）' : '跳过（可在配置中开启）'),
    'Secrets: ' + (setup.secrets?.sync ? '尝试安全同步，不覆盖线上已有密钥' : '跳过'),
    'D1 migration: only with --with-migrations; deploy: never',
  ]
}

export function patchPublicVars(text, setup) {
  const vars = {
    SITE_URL: 'https://' + setup.site.domain,
    ...(setup.site.adminEmail ? { ADMIN_EMAILS: setup.site.adminEmail } : {}),
    ...(setup.google?.clientId ? { GOOGLE_CLIENT_ID: setup.google.clientId } : {}),
    ...(setup.payment?.provider ? { PAYMENT_PROVIDER: setup.payment.provider } : {}),
    ...(setup.payment?.environment ? { WAFFO_ENVIRONMENT: setup.payment.environment } : {}),
    ...(setup.payment?.storeId ? { WAFFO_STORE_ID: setup.payment.storeId } : {}),
    ...(setup.video?.provider ? { VIDEO_PROVIDER: setup.video.provider } : {}),
    ...(setup.moderation?.provider ? { MODERATION_PROVIDER: setup.moderation.provider } : {}),
    ...(typeof setup.email?.from === 'string' ? { EMAIL_FROM: setup.email.from } : {}),
    ...(typeof setup.email?.loginEnabled === 'boolean' ? { EMAIL_LOGIN_ENABLED: String(setup.email.loginEnabled) } : {}),
    ...(setup.turnstile?.siteKey ? { TURNSTILE_SITE_KEY: setup.turnstile.siteKey } : {}),
  }
  let result = Object.entries(vars).reduce((source, [key, value]) => updatePublicVar(source, key, value), text)
  // 商品映射在首次自动创建商品之前必须存在，避免创建成功后无法写回。
  if (setup.payment?.createProducts && !Object.hasOwn(parsedConfig(result).vars ?? {}, 'WAFFO_PRODUCTS')) {
    result = updatePublicVar(result, 'WAFFO_PRODUCTS', '{}')
  }
  return result
}

function argsForMain(argv) {
  const value = (key, fallback) => {
    const i = argv.indexOf(key)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
  }
  const count = ['--plan','--apply','--verify'].filter((a) => argv.includes(a)).length
  if (count > 1) throw new Error('Choose only one mode: --plan, --apply, --verify')
  if (argv.includes('--with-migrations') && !argv.includes('--apply')) {
    throw new Error('--with-migrations requires --apply')
  }
  return {
    mode: argv.includes('--apply') ? 'apply' : argv.includes('--verify') ? 'verify' : 'plan',
    setupFile: value('--config', 'site.setup.json'),
    wranglerFile: value('--wrangler', 'wrangler.jsonc'),
    withMigrations: argv.includes('--with-migrations'),
    allowLivePayments: argv.includes('--allow-live-payments'),
    emailLoginTested: argv.includes('--email-login-tested'),
  }
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log ?? console.log
  const read = deps.read ?? ((path) => readFileSync(path, 'utf8'))
  const write = deps.write ?? ((path, value) => writeFileSync(path, value, 'utf8'))
  const runWrangler = deps.runWrangler ?? ((args) => runChild(WRANGLER, [...args, '-c', options.wranglerFile]))
  const runNode = deps.runNode ?? ((args, env) => runChild(fileURLToPath(new URL('../' + args[0], import.meta.url)), args.slice(1), env))
  let options
  try {
    options = argsForMain(argv)
    const original = read(options.wranglerFile)
    const setup = normalizeSetup(JSON.parse(read(options.setupFile)), parsedConfig(original))
    validateSetup(setup, parsedConfig(original))
    const secretsPath = setup.secrets?.file || '.dev.vars.production'
    if ((setup.secrets?.sync || setup.payment?.createProducts) && !safeSecretPath(secretsPath)) {
      throw new Error('Secrets must use a gitignored .dev.vars.<environment> file name')
    }
    const draft = patchPublicVars(original, setup)
    if (options.mode === 'plan') {
      log('新站启动计划（没有联网或写入）：')
      planDescription(setup, parsedConfig(draft)).forEach((line) => log('  · ' + line))
      if (setup.platforms?.cloudflare?.turnstile || setup.platforms?.cloudflare?.analytics || setup.platforms?.resend?.enabled) {
        log('  · V2: Turnstile / Web Analytics / Resend 按配置创建（--apply 时）')
      }
      if (original !== draft) log('  · 待更新的公开配置: ' + changedVars(original, draft).join(', '))
      return 0
    }
    if (options.mode === 'apply' && setup.payment?.createProducts && setup.payment.environment === 'prod' && !options.allowLivePayments) {
      throw new Error('Creating live Waffo products requires --allow-live-payments')
    }
    if (options.mode === 'verify' && original !== draft) {
      throw new Error('配置尚未同步到 ' + options.wranglerFile + ': ' + changedVars(original, draft).join(', ') + '；请检查计划并执行 --apply')
    }
    if (options.mode === 'apply') {
      const platforms = setup.platforms ?? {}
      const cloudflare = platforms.cloudflare ?? {}
      const resend = platforms.resend ?? {}
      if ((setup.secrets?.sync || setup.payment?.createProducts || cloudflare.turnstile || cloudflare.analytics || resend.enabled) && !existsSync(secretsPath)) {
        throw new Error('Create the local runtime secrets file before initialization')
      }
      if (cloudflare.turnstile || cloudflare.analytics || resend.enabled) {
        if (!existsSync('.dev.vars.platform')) throw new Error('Create .dev.vars.platform and configure platform credentials first')
        const parsed = parseDotenv(read('.dev.vars.platform'))
        if (parsed.errors.length) throw new Error('Invalid platform credentials file')
        const env = Object.fromEntries(parsed.entries)
        if ((cloudflare.turnstile || cloudflare.analytics || (resend.enabled && resend.dns)) && !env.CLOUDFLARE_API_TOKEN) throw new Error('Missing Cloudflare platform token')
        if (resend.enabled && !env.RESEND_ADMIN_API_KEY) throw new Error('Missing Resend administrator key')
      }
      if (setup.payment?.createProducts) {
        if (!existsSync(secretsPath)) throw new Error('Waffo needs a local secrets file')
        const parsed = parseDotenv(read(secretsPath))
        if (parsed.errors.length) throw new Error('Invalid local secrets file; check its lines')
        const env = Object.fromEntries(parsed.entries)
        if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_PRIVATE_KEY) throw new Error('Missing Waffo merchant ID/private key')
      }
      // 正式开启前先核对真实发信、远端密钥和迁移；失败时不修改配置。
      const currentVars = parsedConfig(original).vars ?? {}
      if (setup.email?.loginEnabled === true && currentVars.EMAIL_LOGIN_ENABLED !== 'true') {
        if (!options.emailLoginTested) throw new Error('邮箱登录尚未启用：请先验证发信域名、Turnstile 和真实邮件投递，完成后使用 --email-login-tested')
        const vars = parsedConfig(draft).vars ?? {}
        if (!vars.EMAIL_FROM || !vars.TURNSTILE_SITE_KEY) throw new Error('邮箱登录需要已验证的 EMAIL_FROM 和 TURNSTILE_SITE_KEY')
        const migrations = runWrangler(['d1', 'migrations', 'list', 'DB', '--remote'])
        const pending = migrations.ok ? parsePendingMigrations(migrations.output) : null
        if (pending === null || pending.length) throw new Error('请先确认远端 D1 已应用全部迁移，再启用邮箱登录')
        const result = runWrangler(['secret', 'list', '--format', 'json'])
        const names = result.ok ? parseSecretNames(result.output) : null
        if (!names || !['SESSION_SECRET', 'TURNSTILE_SECRET_KEY'].every((name) => names.includes(name))) throw new Error('远端 Worker 缺少邮箱登录所需的 SESSION_SECRET 或 TURNSTILE_SECRET_KEY')
      }
    }
    const runner = (args) => runWrangler(args)
    let lastSaved = original
    const save = (value) => {
      if (value === lastSaved) return
      write(options.wranglerFile, value)
      lastSaved = value
    }
    if (options.mode === 'apply') save(draft)
    const promises = ensureCloudflare({
      configText: options.mode === 'apply' ? draft : original,
      run: runner,
      apply: options.mode === 'apply',
      write: save,
      log,
    })
    return promises.then(async (updated) => {
      if (options.mode === 'verify') {
        const config = parsedConfig(original)
        if (UUID.test(cloudflareCommands(config).oldD1 ?? '') && !isPlaceholder(cloudflareCommands(config).oldD1) && KV_ID.test(cloudflareCommands(config).oldKv ?? '') && !isPlaceholder(cloudflareCommands(config).oldKv)) {
          log('Cloudflare 远端资源与配置已验证，其他服务仍需实际联调。')
          return 0
        }
        throw new Error('D1/KV still have placeholder IDs in wrangler.jsonc')
      }
      // Optional V2: when the user enabled platform APIs, provision them
      // before payment and runtime secret sync, without publishing the Worker.
      const platforms = setup.platforms ?? {}
      const enabled = Boolean(platforms.cloudflare?.turnstile || platforms.cloudflare?.analytics || platforms.resend?.enabled)
      if (enabled) {
        const result = runNode(['scripts/bootstrap-platforms.mjs', '--apply', '--config', options.setupFile, '--wrangler', options.wranglerFile])
        if (!result.ok) throw new Error('V2 platform provisioning failed; inspect with npm run setup:platforms -- --verify')
        updated = read(options.wranglerFile)
        log('跨平台 V2 资源已处理（未部署）')
      }
      if (setup.payment?.createProducts) {
        if (!existsSync(secretsPath)) throw new Error('Waffo needs a gitignored local secrets file: ' + secretsPath)
        const parsed = parseDotenv(read(secretsPath))
        if (parsed.errors.length) throw new Error('Invalid local secrets file; check its lines')
        const secretVars = Object.fromEntries(parsed.entries.filter(([k]) => ['WAFFO_MERCHANT_ID','WAFFO_PRIVATE_KEY'].includes(k)))
        if (!secretVars.WAFFO_MERCHANT_ID || !secretVars.WAFFO_PRIVATE_KEY) throw new Error('Missing Waffo merchant ID/private key')
        const vars = parsedConfig(updated).vars
        const env = { ...process.env, ...secretVars, WAFFO_PRODUCTS: vars.WAFFO_PRODUCTS, WAFFO_ENVIRONMENT: setup.payment.environment }
        const paymentArgs = ['scripts/waffo-setup.mjs','--store',setup.payment.storeId,'--apply']
        if (setup.payment.environment === 'prod') paymentArgs.push('--prod')
        // No automatic webhook creation: the upstream script cannot yet
        // de-duplicate a partially completed add-webhook request.
        const outcome = runNode(paymentArgs, env)
        if (!outcome.ok) throw new Error('Waffo setup failed. Check existing products before retrying (partial API creation is possible)')
        const hit = outcome.output.match(/^WAFFO_PRODUCTS=(\{[^\r\n]+\})$/m)
        if (!hit) throw new Error('Waffo returned no complete product mapping: check dashboard before retrying')
        const products = JSON.parse(hit[1])
        for (const pkg of site.packages) {
          if (!products[pkg.id]) throw new Error('Waffo response missing ' + pkg.id)
        }
        updated = updatePublicVar(updated, 'WAFFO_PRODUCTS', JSON.stringify(products))
        save(updated)
        log('Waffo 商品映射已写入；Webhook 首次创建仍需在 Waffo 后台确认。')
      }
      if (setup.secrets?.sync) {
        const secretFile = setup.secrets.file || '.dev.vars.production'
        if (!existsSync(secretFile)) throw new Error('Secrets file missing: ' + secretFile)
        const result = runNode(['scripts/sync-secrets.mjs','--apply','--file',secretFile,'-c',options.wranglerFile])
        if (!result.ok) throw new Error('Secret sync paused safely. Worker may not exist yet; use existing sync-secrets instructions after first Worker setup')
        log('Cloudflare Secrets 已同步（未覆盖已有值）')
      }
      if (options.withMigrations) {
        const migration = runner(['d1','migrations','apply','DB','--remote','--yes'])
        if (!migration.ok) throw new Error('Remote D1 migration failed; inspect the database before retrying')
        log('D1 migrations 已应用')
      }
      log('初始化结束。未部署、未配置 OAuth 客户端或域名 DNS；请运行 npm run doctor。')
      return 0
    }).catch((error) => {
      log('✗ ' + error.message)
      return 1
    })
  } catch (error) {
    log('✗ ' + error.message)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve(main()).then((code) => { process.exitCode = code })
}
