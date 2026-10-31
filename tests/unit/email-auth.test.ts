import { describe, expect, it } from 'vitest'
import { generateEmailCode, normalizedLoginEmail, emailCodeHash, requestEmailCode } from '#/server/email-auth'

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
})
