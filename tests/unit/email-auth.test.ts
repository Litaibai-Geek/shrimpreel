import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { generateEmailCode, normalizedLoginEmail, emailCodeHash, requestEmailCode, consumeEmailCode } from '#/server/email-auth'
import { d1Shim, kvShim, migrate } from './d1-sqlite'

describe('email OTP compatibility', () => {
  it('validates emails and random 8 digit codes', () => {
    expect(normalizedLoginEmail(' User@Example.COM ')).toBe('user@example.com')
    expect(normalizedLoginEmail('broken address')).toBeNull()
    expect(generateEmailCode()).toMatch(/^\d{8}$/)
  })

  it('binds a code digest to challenge ID and email, never storing the raw code', async () => {
    const env = { SESSION_SECRET: 's'.repeat(64) } as Env
    const x = await emailCodeHash(env, 'emc_one', 'a@example.com', '12345678')
    expect(x).toMatch(/^[a-f0-9]{64}$/)
    expect(x).not.toContain('12345678')
    expect(await emailCodeHash(env, 'emc_two', 'a@example.com', '12345678')).not.toBe(x)
    expect(await emailCodeHash(env, 'emc_one', 'b@example.com', '12345678')).not.toBe(x)
  })

  it('never reveals Google-only accounts or sends their OTP without opt-in', async () => {
    let emailsSent = 0
    const env = {
      EMAIL_LOGIN_ENABLED: 'true', EMAIL_FROM: 'noreply@tinydeskai.website',
      TURNSTILE_SITE_KEY: '0x4test', TURNSTILE_SECRET_KEY: 'secret',
      SESSION_SECRET: 'a'.repeat(64), SITE_URL: 'https://tinydeskai.website',
      ADMIN_EMAILS: 'admin@tinydeskai.website',
      EMAIL: { send: async () => { emailsSent++; return { messageId: 'sent' } } },
      DB: { prepare: () => ({ bind: () => ({ first: async () => ({
        id: 'usr_old', google_sub: 'google_sub', role: 'user', status: 'active', email_login_enabled: 0,
      }) }) }) },
    } as unknown as Env
    const fake = await requestEmailCode(env, { email: 'legacy@example.com', user: null })
    expect(fake.challengeId).toMatch(/^emc_/)
    expect(emailsSent).toBe(0)
  })

  it('验证码注册与再次登录保留账号，错误、重放和过期验证码均被拒绝', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    migrate(sqlite)
    let delivered = ''
    const env = {
      DB: d1Shim(sqlite), KV: kvShim(), SESSION_SECRET: 's'.repeat(64), ADMIN_EMAILS: 'admin@example.com',
      EMAIL_LOGIN_ENABLED: 'true', EMAIL_FROM: 'noreply@example.com', SITE_URL: 'https://example.com',
      TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key',
      EMAIL: { send: async (mail: { text: string }) => { delivered = mail.text; return { messageId: 'sent' } } },
    } as unknown as Env
    const request = await requestEmailCode(env, { email: 'new@example.com', user: null, locale: 'zh' })
    const code = delivered.match(/\b\d{8}\b/)?.[0]
    expect(code).toBeTruthy()
    const row = sqlite.prepare('SELECT code_hash FROM email_login_challenges WHERE id = ?').get(request.challengeId) as { code_hash: string }
    expect(row.code_hash).not.toContain(code)
    await expect(consumeEmailCode(env, { challengeId: request.challengeId, code: 'abcdefgh', user: null })).rejects.toMatchObject({ code: 'email_code_invalid' })
    const wrongCode = code === '00000000' ? '00000001' : '00000000'
    await expect(consumeEmailCode(env, { challengeId: request.challengeId, code: wrongCode, user: null })).rejects.toMatchObject({ code: 'email_code_invalid' })
    const signup = await consumeEmailCode(env, { challengeId: request.challengeId, code, user: null })
    expect(signup.user).toMatchObject({ email: 'new@example.com', email_login_enabled: 1, role: 'user' })
    await expect(consumeEmailCode(env, { challengeId: request.challengeId, code, user: null })).rejects.toMatchObject({ code: 'email_code_invalid' })
    sqlite.prepare('UPDATE email_login_challenges SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 120000).toISOString(), request.challengeId)
    const again = await requestEmailCode(env, { email: 'new@example.com', user: null })
    const secondCode = delivered.match(/\b\d{8}\b/)?.[0]
    const login = await consumeEmailCode(env, { challengeId: again.challengeId, code: secondCode, user: null })
    expect(login.user.id).toBe(signup.user.id)
    sqlite.prepare('UPDATE email_login_challenges SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 120000).toISOString(), again.challengeId)
    const expired = await requestEmailCode(env, { email: 'new@example.com', user: null })
    const expiredCode = delivered.match(/\b\d{8}\b/)?.[0]
    sqlite.prepare('UPDATE email_login_challenges SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), expired.challengeId)
    await expect(consumeEmailCode(env, { challengeId: expired.challengeId, code: expiredCode, user: null })).rejects.toMatchObject({ code: 'email_code_invalid' })
    sqlite.close()
  })
})
