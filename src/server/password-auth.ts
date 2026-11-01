// 简单的邮箱密码注册登录（当 email.loginEnabled=false 时）
// 不发送验证码，通过 Turnstile + IP 限制防止滥用
import type { RequestAttribution } from './attribution'
import type { SignupReferral } from './referrals'
import { isAdminEmail, upsertUser, type SignInProfile } from './auth'
import type { UserRow } from './types'
import { ApiError, nowIso, sha256Hex } from './util'

// 密码强度要求
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'invalid_password'
  if (password.length < PASSWORD_MIN_LENGTH) return 'password_too_short'
  if (password.length > PASSWORD_MAX_LENGTH) return 'password_too_long'
  return null
}

// 简单的密码哈希（使用 Web Crypto API）
// 生产环境建议使用 bcrypt 或 scrypt，但 Workers 环境下用 PBKDF2
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  const hashArray = Array.from(new Uint8Array(hash))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${saltHex}:${hashHex}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':')
  if (!saltHex || !hashHex) return false

  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  const hashArray = Array.from(new Uint8Array(hash))
  const computedHashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return computedHashHex === hashHex
}

// IP 地址哈希（加盐，防止彩虹表攻击）
export async function hashIp(env: Env, ip: string): Promise<string> {
  const secret = env.SESSION_SECRET ?? 'default-salt'
  return sha256Hex(`ip-registration:${secret}:${ip}`)
}

// 检查 IP 是否已注册过账号
export async function checkIpRegistered(env: Env, ip: string): Promise<boolean> {
  const ipHash = await hashIp(env, ip)
  const existing = await env.DB.prepare(
    'SELECT user_id FROM ip_registrations WHERE ip_hash = ?'
  ).bind(ipHash).first<{ user_id: string }>()
  return Boolean(existing)
}

// 邮箱密码注册
export async function registerWithPassword(env: Env, input: {
  email: unknown
  password: unknown
  name?: string
  ip: string
  locale?: string | null
  country?: string | null
  attribution?: RequestAttribution | null
  referral?: SignupReferral | null
}): Promise<UserRow> {
  const email = normalizeEmail(input.email)
  if (!email) throw new ApiError(400, 'invalid_email')

  // 管理员不能通过密码注册
  if (isAdminEmail(env, email)) throw new ApiError(403, 'admin_cannot_register')

  const passwordError = validatePassword(input.password)
  if (passwordError) throw new ApiError(400, passwordError)

  const db = env.DB

  // 检查邮箱是否已存在
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first<{ id: string }>()
  if (existing) throw new ApiError(409, 'email_already_exists')

  // 检查 IP 是否已注册
  const ipRegistered = await checkIpRegistered(env, input.ip)
  if (ipRegistered) throw new ApiError(429, 'ip_already_registered')

  // 创建用户（复用 upsertUser 的注册逻辑）
  const passwordHash = await hashPassword(input.password as string)
  const profile: SignInProfile = {
    email,
    name: input.name || null,
    picture: null,
    googleSub: null,
    emailLoginEnabled: true, // 密码注册的用户默认启用邮箱登录
    country: input.country ?? null,
    locale: input.locale ?? null,
    attribution: input.attribution,
    referral: input.referral,
  }

  const user = await upsertUser(env, profile)

  // 更新密码哈希
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, user.id).run()

  // 记录 IP 注册
  const ipHash = await hashIp(env, input.ip)
  await db.prepare(
    'INSERT INTO ip_registrations (ip_hash, user_id, registered_at) VALUES (?, ?, ?)'
  ).bind(ipHash, user.id, nowIso()).run()

  return user
}

// 邮箱密码登录
export async function signInWithPassword(env: Env, input: {
  email: unknown
  password: unknown
}): Promise<UserRow> {
  const email = normalizeEmail(input.email)
  if (!email) throw new ApiError(400, 'invalid_email')

  if (typeof input.password !== 'string') throw new ApiError(400, 'invalid_password')

  const db = env.DB
  const user = await db.prepare(
    'SELECT * FROM users WHERE email = ? AND password_hash IS NOT NULL'
  ).bind(email).first<UserRow>()

  if (!user) throw new ApiError(401, 'invalid_credentials')
  if (user.status !== 'active') throw new ApiError(403, 'account_disabled')

  // 验证密码
  const passwordValid = await verifyPassword(input.password as string, user.password_hash!)
  if (!passwordValid) throw new ApiError(401, 'invalid_credentials')

  // 更新最后登录时间
  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(nowIso(), user.id).run()

  return user
}
