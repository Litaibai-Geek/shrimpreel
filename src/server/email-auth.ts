import { site } from '#/config/site'
import type { RequestAttribution } from './attribution'
import type { SignupReferral } from './referrals'
import { isAdminEmail, upsertUser } from './auth'
import { emailConfig } from './email'
import type { UserRow } from './types'
import { ApiError, cleanSecret, constantTimeEqual, createId, hmacSha256, nowIso } from './util'

export const EMAIL_CODE_LENGTH = 8
export const EMAIL_CODE_TTL_MS = 10 * 60_000
const CODE_ATTEMPT_LIMIT = 5
const CODE_COOLDOWN_MS = 60_000
const HOURLY_REQUEST_LIMIT = 6
type Purpose = 'login' | 'enable'
type Challenge = {
  id: string
  email: string
  purpose: Purpose
  user_id: string | null
  code_hash: string
  attempts: number
  expires_at: string
}

export function normalizedLoginEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

// Turning on email OTP requires a verified sender and Turnstile. All three
// must be explicitly configured before enabling it in production.
export function emailLoginAvailable(env: Env): boolean {
  return env.EMAIL_LOGIN_ENABLED === 'true'
    && Boolean(emailConfig(env))
    && Boolean(cleanSecret(env.SESSION_SECRET))
    && Boolean(env.TURNSTILE_SITE_KEY?.trim() && cleanSecret(env.TURNSTILE_SECRET_KEY))
}

export function generateEmailCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]!
  return String(n % (10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, '0')
}

export async function emailCodeHash(env: Env, id: string, email: string, code: string) {
  const secret = cleanSecret(env.SESSION_SECRET)
  if (!secret) throw new ApiError(503, 'email_login_unavailable')
  const bytes = await hmacSha256(secret, 'email-otp:' + id + ':' + email + ':' + code)
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function requestEmailCode(env: Env, input: {
  email: unknown
  purpose?: Purpose
  user: UserRow | null
  locale?: string | null
}) {
  if (!emailLoginAvailable(env)) throw new ApiError(503, 'email_login_unavailable')
  const email = normalizedLoginEmail(input.email)
  if (!email) throw new ApiError(400, 'invalid_email')
  const purpose = input.purpose ?? 'login'
  if (purpose !== 'login' && purpose !== 'enable') throw new ApiError(400, 'email_code_invalid')
  const user = input.user
  if (purpose === 'enable' && (!user || user.email !== email || user.role === 'admin' || user.email_login_enabled === 1)) {
    throw new ApiError(403, 'email_link_not_allowed')
  }
  const db = env.DB
  const existing = await db.prepare('SELECT id, google_sub, role, status, email_login_enabled FROM users WHERE email = ?')
    .bind(email).first<Pick<UserRow, 'id' | 'google_sub' | 'role' | 'status' | 'email_login_enabled'>>()
  // Uniform response avoids exposing whether an email already belongs to a
  // Google-only account. Such users must explicitly link from their session.
  if (purpose === 'login' && (isAdminEmail(env, email)
    || (existing && (existing.status !== 'active' || existing.email_login_enabled !== 1)))) {
    return { challengeId: createId('emc') }
  }
  const now = Date.now()
  const last = await db.prepare('SELECT created_at FROM email_login_challenges WHERE email = ? ORDER BY created_at DESC LIMIT 1')
    .bind(email).first<{ created_at: string }>()
  if (last && now - Date.parse(last.created_at) < CODE_COOLDOWN_MS) return { challengeId: createId('emc') }
  const hourly = await db.prepare('SELECT COUNT(*) AS count FROM email_login_challenges WHERE email = ? AND created_at > ?')
    .bind(email, new Date(now - 3600_000).toISOString()).first<{ count: number }>()
  if ((hourly?.count ?? 0) >= HOURLY_REQUEST_LIMIT) return { challengeId: createId('emc') }
  const config = emailConfig(env)
  if (!config) throw new ApiError(503, 'email_login_unavailable')
  const id = createId('emc')
  const code = generateEmailCode()
  await db.prepare(
    'INSERT INTO email_login_challenges (id, email, purpose, user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    id, email, purpose, purpose === 'enable' ? user!.id : null,
    await emailCodeHash(env, id, email, code), nowIso(), new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
  ).run()
  const zh = input.locale === 'zh'
  try {
    await config.mailer.send({
      from: config.from,
      to: email,
      subject: site.brandName + (zh ? ' 验证码' : ' verification code'),
      text: zh ? '你的验证码是 ' + code + '，10 分钟内有效。如果不是本人操作，请忽略。'
        : 'Your verification code is ' + code + '. It expires in 10 minutes. If you did not request it, ignore this email.',
      html: '<p>' + (zh ? '验证码：' : 'Verification code: ') + '<strong>' + code + '</strong></p>'
        + '<p>' + (zh ? '10 分钟内有效。' : 'Valid for 10 minutes.') + '</p>',
      replyTo: site.supportEmail,
    })
  } catch {
    await db.prepare('DELETE FROM email_login_challenges WHERE id = ?').bind(id).run()
    throw new ApiError(503, 'email_delivery_unavailable')
  }
  return { challengeId: id }
}

export async function consumeEmailCode(env: Env, input: {
  challengeId: unknown
  code: unknown
  user: UserRow | null
  locale?: string | null
  country?: string | null
  attribution?: RequestAttribution | null
  referral?: SignupReferral | null
}): Promise<{ user: UserRow; linked: boolean }> {
  if (!emailLoginAvailable(env)) throw new ApiError(503, 'email_login_unavailable')
  if (typeof input.challengeId !== 'string' || !/^emc_[A-Za-z0-9_-]{8,80}$/.test(input.challengeId)
    || typeof input.code !== 'string' || !/^\d{8}$/.test(input.code)) {
    throw new ApiError(400, 'email_code_invalid')
  }
  const now = nowIso()
  const challenge = await env.DB.prepare(
    'UPDATE email_login_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ? RETURNING *',
  ).bind(input.challengeId, now, CODE_ATTEMPT_LIMIT).first<Challenge>()
  if (!challenge) throw new ApiError(400, 'email_code_invalid')
  const digest = await emailCodeHash(env, challenge.id, challenge.email, input.code)
  if (!constantTimeEqual(digest, challenge.code_hash)) throw new ApiError(400, 'email_code_invalid')
  if (challenge.purpose === 'enable' && (!input.user || input.user.id !== challenge.user_id
      || input.user.email !== challenge.email || input.user.role === 'admin')) {
    throw new ApiError(403, 'email_link_not_allowed')
  }
  const consumed = await env.DB.prepare(
    'UPDATE email_login_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND attempts = ?',
  ).bind(now, challenge.id, challenge.attempts).run()
  if (!consumed.meta.changes) throw new ApiError(400, 'email_code_invalid')
  if (challenge.purpose === 'enable') {
    await env.DB.prepare(
      "UPDATE users SET email_login_enabled = 1 WHERE id = ? AND email = ? AND status = 'active' AND role != 'admin'",
    ).bind(input.user!.id, challenge.email).run()
    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(input.user!.id).first<UserRow>()
    if (!updated || updated.email_login_enabled !== 1) throw new ApiError(403, 'email_link_not_allowed')
    return { user: updated, linked: true }
  }
  const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(challenge.email).first<UserRow>()
  if (existing && (existing.status !== 'active' || existing.role === 'admin' || existing.email_login_enabled !== 1)) {
    throw new ApiError(403, 'email_link_not_allowed')
  }
  if (!existing && isAdminEmail(env, challenge.email)) throw new ApiError(403, 'email_link_not_allowed')
  // The optional flag only initializes newly created users. An email code
  // can never silently activate email login on an old Google account.
  const signedIn = await upsertUser(env, {
    email: challenge.email, name: null, picture: null, googleSub: null,
    emailLoginEnabled: true, country: input.country ?? null, locale: input.locale ?? null,
    attribution: input.attribution, referral: input.referral,
  })
  if (signedIn.email_login_enabled !== 1 || signedIn.role === 'admin') {
    throw new ApiError(403, 'email_link_not_allowed')
  }
  return { user: signedIn, linked: false }
}
