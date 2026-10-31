import { useState, type FormEvent } from 'react'
import { Turnstile } from '#/components/Turnstile'
import { ErrorText, Spinner } from '#/components/ui'
import { api, errorCode } from '#/lib/api'
import { useContent, useLocale } from '#/lib/i18n'
import { useSession } from '#/lib/session'

export function EmailCodeForm({
  purpose, email: fixedEmail, onSuccess,
}: {
  purpose: 'login' | 'enable'
  email?: string
  onSuccess: () => Promise<void> | void
}) {
  const t = useContent().signIn
  const locale = useLocale()
  const { config } = useSession()
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const siteKey = config?.turnstileSiteKey ?? null

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await api<{ challengeId: string }>('/api/auth/email/request', {
        json: {
          email: fixedEmail ?? email,
          purpose,
          locale,
          turnstileToken: captcha,
        },
      })
      setChallengeId(response.challengeId)
      setCode('')
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
      setCaptcha(null)
      setCaptchaKey((x) => x + 1)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/email/verify', { json: { challengeId, code, locale } })
      await onSuccess()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 text-left" data-testid="email-code-form">
      <h2 className="text-sm font-semibold">{purpose === 'enable' ? t.emailLinkTitle : t.emailTitle}</h2>
      <p className="text-xs leading-5 text-muted">
        {purpose === 'enable' ? t.emailLinkHint : t.emailHint}
      </p>
      {!challengeId ? (
        <form className="space-y-3" onSubmit={sendCode}>
          <label className="block space-y-1.5 text-sm">
            <span>{t.devEmail}</span>
            <input className="input w-full" type="email" autoComplete="email" required maxLength={254}
              value={fixedEmail ?? email} disabled={busy || Boolean(fixedEmail)}
              onChange={(event) => setEmail(event.target.value)} data-testid="email-login-address" />
          </label>
          {siteKey ? <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={captchaKey} /> : null}
          <button className="btn-primary w-full py-3" type="submit"
            disabled={busy || Boolean(siteKey && !captcha)} data-testid="email-send-code">
            {busy ? <Spinner /> : null} {t.emailSendCode}
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={verifyCode}>
          <p className="text-xs text-muted" role="status">{t.emailCodeSent}</p>
          <label className="block space-y-1.5 text-sm">
            <span>{t.emailCodeLabel}</span>
            <input className="input w-full font-mono tracking-wider" type="text" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} minLength={8} required
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              data-testid="email-login-code" />
          </label>
          <button className="btn-primary w-full py-3" type="submit"
            disabled={busy || code.length !== 8} data-testid="email-verify-code">
            {busy ? <Spinner /> : null} {t.emailVerifyCode}
          </button>
          <button type="button" className="text-xs text-muted underline"
            onClick={() => { setChallengeId(null); setCode(''); setError(null) }}>
            {t.emailTryAgain}
          </button>
        </form>
      )}
      <ErrorText code={error} />
    </div>
  )
}
