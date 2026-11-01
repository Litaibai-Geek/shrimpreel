import { useState, type FormEvent } from 'react'
import { Turnstile } from '#/components/Turnstile'
import { ErrorText, Spinner } from '#/components/ui'
import { api, errorCode } from '#/lib/api'
import { useContent, useLocale } from '#/lib/i18n'
import { useSession } from '#/lib/session'

export function PasswordSignUpForm({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const t = useContent().signIn
  const locale = useLocale()
  const { config } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const siteKey = config?.turnstileSiteKey ?? null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('password_mismatch')
      return
    }

    if (password.length < 8) {
      setError('password_too_short')
      return
    }

    setBusy(true)
    try {
      await api('/api/auth/password/register', {
        json: {
          name: name.trim() || undefined,
          email,
          password,
          locale,
          turnstileToken: captcha,
        },
      })
      await onSuccess()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
      setCaptcha(null)
      setCaptchaKey((x) => x + 1)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} data-testid="password-signup-form">
      <label className="block space-y-1.5 text-sm">
        <span>{t.name || 'Name'}</span>
        <input
          className="input w-full"
          type="text"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.namePlaceholder || 'Enter your name'}
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span>{t.email || 'Email'}</span>
        <input
          className="input w-full"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder || 'Enter your email'}
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span>{t.password || 'Password'}</span>
        <input
          className="input w-full"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.passwordPlaceholder || 'Enter your password'}
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span>{t.confirmPassword || 'Confirm Password'}</span>
        <input
          className="input w-full"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t.confirmPasswordPlaceholder || 'Re-enter your password'}
        />
      </label>

      {siteKey ? <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={captchaKey} /> : null}

      <button
        className="btn-primary w-full py-3"
        type="submit"
        disabled={busy || Boolean(siteKey && !captcha)}
        data-testid="password-signup-submit"
      >
        {busy ? <Spinner /> : null} {t.signUp || 'Sign Up'}
      </button>

      <ErrorText code={error} />
    </form>
  )
}

export function PasswordSignInForm({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const t = useContent().signIn
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await api('/api/auth/password/signin', {
        json: { email, password, locale },
      })
      await onSuccess()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} data-testid="password-signin-form">
      <label className="block space-y-1.5 text-sm">
        <span>{t.email || 'Email'}</span>
        <input
          className="input w-full"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder || 'Enter your email'}
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span>{t.password || 'Password'}</span>
        <input
          className="input w-full"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.passwordPlaceholder || 'Enter your password'}
        />
      </label>

      <button
        className="btn-primary w-full py-3"
        type="submit"
        disabled={busy}
        data-testid="password-signin-submit"
      >
        {busy ? <Spinner /> : null} {t.signIn || 'Sign In'}
      </button>

      <ErrorText code={error} />
    </form>
  )
}
