import { useRouterState } from '@tanstack/react-router'
import { ArrowRight, CircleAlert, CircleCheck, Clock3, Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { STYLES, cheapestPackageCovering, defaultStyle, formatPrice, site } from '#/config/site'
import { BAND_MAX, BAND_MIN } from '#/lib/band'
import { api, ApiRequestError, errorCode, isActiveGeneration, type Generation } from '#/lib/api'
import { preparePhoto } from '#/lib/prepare-photo'
import { track } from '#/lib/attribution'
import { useCheckout } from '#/lib/checkout'
import { useContent, useLocale, useLocalePath } from '#/lib/i18n'
import { signInHref, useSession } from '#/lib/session'
import { AiBadge, ErrorText, GoogleIcon, LocalLink, Spinner, formatDate } from './ui'

type Photo = { file: File; previewUrl: string; uploadId: string | null }

const POLL_MS = 3000

// styleId / onStyleChange：首页把风格状态提到外面，让 hero 标签和生成器同步；不传时生成器自己管
export function Generator({ styleId: controlledStyleId, onStyleChange }: { styleId?: string; onStyleChange?: (id: string) => void } = {}) {
  const c = useContent()
  const g = c.generator
  const lp = useLocalePath()
  const locale = useLocale()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user, config, loading, refresh } = useSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const bandInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'solo' | 'band'>('solo')
  const [bandPhotos, setBandPhotos] = useState<Photo[]>([])
  const bandPhotosRef = useRef<Photo[]>([])
  const bandUploadsRef = useRef(new Map<File, string>())
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [bandUploadProgress, setBandUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [ownStyleId, setOwnStyleId] = useState<string>(defaultStyle.id)
  const styleId = controlledStyleId ?? ownStyleId
  const selectStyle = onStyleChange ?? setOwnStyleId
  const [durationId, setDurationId] = useState<string>(site.durations[site.durations.length - 1]!.id)
  const [consent, setConsent] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState<Generation | null>(null)

  const checkout = useCheckout()
  const duration = site.durations.find((d) => d.id === durationId) ?? site.durations[0]!
  const shortfall = user ? Math.max(0, duration.credits - user.credits) : 0
  // 余额不足时直接在这里下单够用的最便宜积分包；没有够用的包就退回去价格页
  const coverPack = shortfall > 0 ? cheapestPackageCovering(shortfall) : undefined

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl)
  }, [photo])
  useEffect(() => { bandPhotosRef.current = bandPhotos }, [bandPhotos])
  useEffect(() => () => {
    bandPhotosRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  }, [])

  // 轮询当前任务直到结束；结束后刷新余额（失败时积分已退回）
  useEffect(() => {
    if (!generation || !isActiveGeneration(generation)) return
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ generation: Generation }>(`/api/generations/${generation.id}`)
        setGeneration(data.generation)
        if (!isActiveGeneration(data.generation)) await refresh()
      } catch (err) {
        setError(errorCode(err))
        setGeneration({ ...generation })
      }
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [generation, refresh])

  async function upload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      let prepared: File | null
      try { prepared = await preparePhoto(file) } catch { throw new ApiRequestError(400, 'image_processing_failed') }
      if (prepared) form.append('prepared', prepared)
      const data = await api<{ upload: { id: string } }>('/api/uploads', { form })
      return data.upload.id
    } finally {
      setUploading(false)
    }
  }

  async function selectFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!(site.upload.contentTypes as readonly string[]).includes(file.type)) return setError('unsupported_file_type')
    if (file.size > site.upload.maxBytes) return setError('file_too_large')
    const next: Photo = { file, previewUrl: URL.createObjectURL(file), uploadId: null }
    setPhoto(next)
    setGeneration(null)
    if (!user) return
    try {
      const uploadId = await upload(file)
      setPhoto((current) => (current?.file === file ? { ...current, uploadId } : current))
    } catch (err) {
      setError(errorCode(err))
    }
  }

  function selectBandFiles(files: FileList | null) {
    if (!files) return
    const picked = Array.from(files)
    if (picked.length < BAND_MIN || picked.length > BAND_MAX) return setError('band_invalid')
    if (picked.some((file) => !(site.upload.contentTypes as readonly string[]).includes(file.type))) return setError('unsupported_file_type')
    if (picked.some((file) => file.size > site.upload.maxBytes)) return setError('file_too_large')
    bandPhotosRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    bandUploadsRef.current.clear()
    setBandPhotos(picked.map((file) => ({ file, previewUrl: URL.createObjectURL(file), uploadId: null })))
    setGeneration(null)
    setError(null)
  }

  function moveBandPhoto(from: number, to: number) {
    setBandPhotos((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current
      const next = [...current]
      ;[next[from], next[to]] = [next[to]!, next[from]!]
      return next
    })
  }

  async function generate() {
    if (mode === 'solo' && !photo) return setError('invalid_upload')
    if (mode === 'band' && (bandPhotos.length < BAND_MIN || bandPhotos.length > BAND_MAX)) return setError('band_invalid')
    setError(null)
    setSubmitting(true)
    try {
      let json: Record<string, unknown>
      if (mode === 'band') {
        const uploadIds: string[] = []
        for (const [index, item] of bandPhotos.entries()) {
          setBandUploadProgress({ current: index + 1, total: bandPhotos.length })
          let id = bandUploadsRef.current.get(item.file)
          if (!id) {
            id = await upload(item.file)
            bandUploadsRef.current.set(item.file, id)
          }
          uploadIds.push(id)
        }
        setBandUploadProgress(null)
        json = { mode: 'band', uploadIds, durationId, styleId, locale }
      } else {
        const uploadId = photo!.uploadId ?? (await upload(photo!.file))
        if (!photo!.uploadId) setPhoto({ ...photo!, uploadId })
        json = { uploadId, durationId, styleId, locale }
      }
      const data = await api<{ generation: Generation }>('/api/generations', { json })
      track('generate_video', { style_id: styleId, duration_id: durationId, credits: data.generation.creditsCost })
      setGeneration(data.generation)
      await refresh()
    } catch (err) {
      setError(errorCode(err))
      await refresh()
    } finally {
      setBandUploadProgress(null)
      setSubmitting(false)
    }
  }

  function reset() {
    setGeneration(null)
    setError(null)
  }

  const busy = uploading || submitting || (generation !== null && isActiveGeneration(generation))
  const photosReady = mode === 'band' ? bandPhotos.length >= BAND_MIN && bandPhotos.length <= BAND_MAX : Boolean(photo)

  return (
    <section
      className="card space-y-5 p-5 shadow-[0_1px_0_var(--line),0_20px_40px_-24px_rgba(0,0,0,0.25)] sm:p-6"
      aria-labelledby="generator-title"
      data-testid="generator"
    >
      {/* 标题只给读屏和大纲用：页面 H1 之后接 H2，步骤标题是 H3 */}
      <h2 id="generator-title" className="sr-only">
        {g.title}
      </h2>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg-soft p-1" role="radiogroup" aria-label={g.modeLabel} data-testid="generator-mode">
        {(['solo', 'band'] as const).map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={mode === choice} disabled={busy}
            onClick={() => { setMode(choice); setGeneration(null); setError(null) }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === choice ? 'bg-card shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}
            data-testid={`mode-${choice}`}>
            {choice === 'solo' ? g.modeSolo : g.modeBand}
          </button>
        ))}
      </div>
      {/* Solo: preserve the original photo upload UI. */}
      {mode === 'solo' ? (
      <section className="space-y-3">
        <StepTitle n={1}>{g.stepPhoto}</StepTitle>
        {/* 键盘与读屏从下面的按钮进入，隐藏的 input 不占 Tab 位 */}
        <input
          ref={inputRef}
          type="file"
          accept={site.upload.contentTypes.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-label={g.dropTitle}
          data-testid="photo-input"
          onChange={(event) => {
            void selectFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void selectFile(event.dataTransfer.files?.[0])
          }}
          className={`flex w-full items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-fg/40'
          }`}
        >
          {photo ? (
            <span className="flex items-center gap-4 text-left">
              <img src={photo.previewUrl} alt="" className="size-20 rounded-lg object-cover" />
              <span className="space-y-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {uploading ? <Spinner /> : <CircleCheck className="size-4 text-emerald-600" />}
                  {uploading ? g.uploading : photo.uploadId ? g.uploaded : g.localPhotoReady}
                </span>
                <span className="block text-xs text-muted underline">{g.change}</span>
              </span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2.5">
              <span className="grid size-11 place-items-center rounded-full bg-ink text-ink-fg">
                <Upload className="size-5" />
              </span>
              <span className="text-sm font-semibold">{g.dropTitle}</span>
              <span className="text-xs text-muted">{g.dropHint}</span>
            </span>
          )}
        </button>
        <p className="text-xs leading-5 text-muted">{g.guidance}</p>
        {!user && photo ? <p className="text-xs leading-5 text-muted" role="status">{g.signInNote}</p> : null}
      </section>
      ) : (
      <section className="space-y-3">
        <StepTitle n={1}>{g.bandStepPhoto}</StepTitle>
        <input ref={bandInputRef} type="file" multiple accept={site.upload.contentTypes.join(',')}
          className="sr-only" tabIndex={-1} aria-label={g.bandChoose} data-testid="band-photos"
          onChange={(event) => { selectBandFiles(event.target.files); event.target.value = '' }} />
        <button type="button" disabled={busy} onClick={() => bandInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-5 text-sm font-semibold hover:border-fg/40"
          data-testid="band-select"><Upload className="size-5" />{g.bandChoose}</button>
        <p className="text-xs leading-5 text-muted">{g.bandGuidance}</p>
        {bandPhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="band-preview">
            {bandPhotos.map((item, index) => (
              <div key={index} className="rounded-xl border border-line p-2">
                <img src={item.previewUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                <p className="mt-2 text-xs font-medium">{g.bandRoleNames[index]}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs"
                    aria-label={`${g.bandMoveEarlier}: ${g.bandRoleNames[index]}`}
                    disabled={busy || index === 0} onClick={() => moveBandPhoto(index, index - 1)}>←</button>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs"
                    aria-label={`${g.bandMoveLater}: ${g.bandRoleNames[index]}`}
                    disabled={busy || index === bandPhotos.length - 1} onClick={() => moveBandPhoto(index, index + 1)}>→</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!user && bandPhotos.length ? <p className="text-xs text-muted">{g.signInNote}</p> : null}
        {durationId === 'short' ? <p className="text-xs text-muted">{g.bandShortWarning}</p> : null}
      </section>
      )}

      {bandUploadProgress ? <p role="status" className="flex items-center gap-2 text-sm text-muted" data-testid="band-upload-progress"><Spinner className="size-4" />{g.bandUploading(bandUploadProgress.current, bandUploadProgress.total)}</p> : null}

      {/* 2. 风格：只有一种风格时不显示 */}
      {STYLES.length > 1 ? (
        <section className="space-y-3">
          <StepTitle n={2}>{g.stepStyle}</StepTitle>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={g.stepStyle}>
            {STYLES.map((style) => {
              const active = style.id === styleId
              const copy = c.styles[style.id as keyof typeof c.styles]
              const thumb = style.examples.previews.find((clip) => clip.poster)
              return (
                <button
                  key={style.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  data-testid={`style-${style.id}`}
                  onClick={() => selectStyle(style.id)}
                  className={`flex items-center gap-3 rounded-xl p-2 text-left transition ${active ? 'bg-card shadow-sm ring-2 ring-ink' : 'bg-bg-soft text-muted ring-1 ring-line hover:text-fg'}`}
                >
                  {thumb ? <img src={thumb.poster} alt="" loading="lazy" className="aspect-[3/4] w-10 shrink-0 rounded-md object-cover" /> : null}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{copy.name}</span>
                    <span className="block text-xs text-muted">{copy.tagline}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* 时长 */}
      <section className="space-y-3">
        <StepTitle n={STYLES.length > 1 ? 3 : 2}>{g.stepLength}</StepTitle>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg-soft p-1" role="radiogroup" aria-label={g.stepLength}>
          {site.durations.map((d) => {
            const active = d.id === durationId
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy}
                data-testid={`duration-${d.id}`}
                onClick={() => setDurationId(d.id)}
                className={`rounded-lg px-2 py-2 text-center transition ${active ? 'bg-card shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}
              >
                <span className="block text-sm font-semibold">
                  {g.seconds(d.seconds)}
                  {'isFull' in d && d.isFull ? ` · ${g.full}` : ''}
                </span>
                <span className="block text-xs text-muted">{g.creditsLabel(d.credits)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <label className="flex items-start gap-3 text-xs leading-5 text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]"
          data-testid="consent"
        />
        <span>{mode === 'band' ? g.bandConsent : g.consent}</span>
      </label>

      {/* CTA */}
      <div className="space-y-2">
        {loading ? (
          <div className="btn-primary w-full py-3.5 opacity-60">
            <Spinner />
          </div>
        ) : !user ? (
          <a href={signInHref(config, `${pathname}#create`, lp('/sign-in'))} className="btn-primary w-full py-3.5" data-testid="generator-sign-up">
            <GoogleIcon /> {g.ctaSignUp}
          </a>
        ) : shortfall > 0 && coverPack ? (
          <>
            <button
              type="button"
              className="btn-primary w-full py-3.5"
              disabled={checkout.pending !== null || checkout.paused}
              onClick={() => checkout.buy(coverPack.id)}
              data-testid="generator-buy"
            >
              {checkout.paused ? (
                c.pricing.paused
              ) : checkout.pending === coverPack.id ? (
                <>
                  <Spinner /> {c.pricing.buying}
                </>
              ) : (
                g.ctaBuyPack(coverPack.credits, formatPrice(coverPack.priceCents, coverPack.currency))
              )}
            </button>
            <p className="text-center text-xs">
              <LocalLink to="/pricing" className="text-muted underline" data-testid="generator-see-packs">
                {g.seePacks}
              </LocalLink>
            </p>
            <ErrorText code={checkout.error} />
          </>
        ) : shortfall > 0 ? (
          <LocalLink to="/pricing" className="btn-primary w-full py-3.5" data-testid="generator-buy">
            {g.ctaBuy}
          </LocalLink>
        ) : (
          <button
            type="button"
            className="btn-primary w-full py-3.5"
            disabled={busy || !photosReady || !consent}
            onClick={generate}
            data-testid="generate"
          >
            {submitting ? <Spinner /> : null}
            {g.ctaGenerate(duration.credits)}
          </button>
        )}
        {user ? (
          <p className="text-center text-xs text-muted" data-testid="generator-balance">
            {g.balance(user.credits)}
            {shortfall > 0 ? ` · ${g.needMore(shortfall)}` : ''}
          </p>
        ) : null}
        {user && photosReady && !consent && !generation ? <p className="text-center text-xs text-muted">{g.needConsent}</p> : null}
        <ErrorText code={error} />
      </div>

      {generation ? <GenerationResult generation={generation} onReset={reset} /> : null}
    </section>
  )
}

function StepTitle({ n, children }: { n: number; children: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-ink-fg">{n}</span>
      {children}
    </h3>
  )
}

function GenerationResult({ generation, onReset }: { generation: Generation; onReset: () => void }) {
  const g = useContent().generator
  const locale = useLocale()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isActiveGeneration(generation)) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [generation.id, generation.status])
  const start = Date.parse(generation.createdAt)
  const elapsed = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null
  const time = elapsed === null ? null : `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg-soft p-4" data-testid="generation-status" data-status={generation.status}>
      {isActiveGeneration(generation) ? (
        <div className="space-y-4" data-testid="generation-waiting">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-fg ring-1 ring-line"><Spinner className="size-5" /></span>
            <div className="min-w-0 space-y-1">
              <p role="status" className="text-sm font-semibold text-fg">{generation.status === 'queued' ? g.queued : g.processing}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {time !== null ? <span className="inline-flex items-center gap-1" data-testid="generation-elapsed"><Clock3 className="size-3.5" aria-hidden="true" />{g.elapsed(time)}</span> : null}
                <span aria-hidden="true">·</span><span>{g.seconds(generation.durationSeconds)}</span>
                <span aria-hidden="true">·</span><span>{g.creditsLabel(generation.creditsCost)}</span>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="flex items-center gap-1.5 text-muted"><span className="size-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none" /><span className="size-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none" /><span className="size-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none" /></div>
          <p className="text-xs leading-5 text-muted">{elapsed !== null && elapsed >= 300 ? g.waitingLong : g.waitingBody}</p>
          <LocalLink to="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-fg underline underline-offset-4" data-testid="generation-view-all">{g.viewAll}<ArrowRight className="size-4" aria-hidden="true" /></LocalLink>
        </div>
      ) : generation.status === 'succeeded' && generation.videoUrl ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CircleCheck className="size-4 text-emerald-600" /> {g.succeeded}
          </p>
          <div className="relative mx-auto w-fit">
            <AiBadge />
            <video src={generation.videoUrl} controls playsInline className="max-h-[420px] rounded-lg bg-black" data-testid="generation-video" />
          </div>
          <p className="text-xs text-muted" data-testid="ai-notice">
            {g.aiNotice}
            {generation.expiresAt ? ` ${g.expiresOn(formatDate(generation.expiresAt, locale))}` : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`${generation.videoUrl}?download=1`} className="btn-primary px-4 py-2" download>
              <Download className="size-4" /> {g.download}
            </a>
            <LocalLink to="/dashboard" className="btn-ghost px-4 py-2">
              {g.viewAll}
            </LocalLink>
            <button type="button" className="btn-ghost px-4 py-2" onClick={onReset}>
              {g.makeAnother}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
            <CircleAlert className="size-4" /> {g.failed}
          </p>
          {generation.refunded ? <p className="text-muted">{g.refunded}</p> : null}
          <button type="button" className="btn-ghost px-4 py-2" onClick={onReset}>
            {g.makeAnother}
          </button>
        </div>
      )}
    </div>
  )
}
