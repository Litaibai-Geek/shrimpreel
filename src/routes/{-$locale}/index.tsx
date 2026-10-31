import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowRight, Camera, Check, Clock, Coins, Film, Flame, ShieldCheck, Smartphone, X } from 'lucide-react'
import { Faq, faqJsonLd } from '#/components/Faq'
import { Generator } from '#/components/Generator'
import { Pricing } from '#/components/Pricing'
import { VideoCard } from '#/components/VideoCard'
import { LocalLink } from '#/components/ui'
import { STYLES, articlePath, defaultStyle, findStyle, formatPrice, site } from '#/config/site'
import { getContent, localeFromParam, pageHead, useContent } from '#/lib/i18n'
import { homeJsonLd, jsonLdScript } from '#/lib/seo'

// ?style=<id> 预选风格（不存在的 id 忽略）
export const Route = createFileRoute('/{-$locale}/')({
  validateSearch: (search: Record<string, unknown>): { style?: string } => ({
    style: typeof search.style === 'string' && findStyle(search.style) ? search.style : undefined,
  }),
  head: ({ params }) => {
    const locale = localeFromParam(params.locale)
    const c = getContent(locale)
    const head = pageHead(locale, '/', c.meta.homeTitle, c.meta.homeDescription)
    return {
      ...head,
      scripts: [
        jsonLdScript(homeJsonLd(locale, c.meta.homeDescription, { name: `${c.hero.aiVersion} – ${site.keyword}`, description: c.madeWith.body })),
        jsonLdScript(faqJsonLd(c.faq.items)),
      ],
    }
  },
  component: Home,
})

const FEATURE_ICONS = [Camera, Film, Smartphone, Clock, ShieldCheck, Coins]

function Home() {
  const c = useContent()
  const search = Route.useSearch()
  // hero 标签和生成器共用同一个风格；SSR 默认显示默认风格（或 URL 指定的）
  const [styleId, setStyleId] = useState<string>(search.style ?? defaultStyle.id)
  const style = findStyle(styleId) ?? defaultStyle
  const heroClips = style.examples.previews.filter((clip) => clip.video && clip.poster)
  const hasMadeWithExamples = STYLES.some((item) => item.examples.madeWith.photo && item.examples.madeWith.video && item.examples.madeWith.poster)
  const styleCopy = (id: string) => c.styles[id as keyof typeof c.styles]
  return (
    <>
      {/* Hero：先展示 Tiny Desk 演出氛围，再引导用户开始创作 */}
      <section className="relative isolate overflow-hidden bg-[#17130f] text-[#fff8ef]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 78% 18%, rgba(227, 166, 91, 0.22), transparent 36%), radial-gradient(circle at 8% 88%, rgba(183, 72, 72, 0.18), transparent 34%)',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-24 -top-36 size-[30rem] rounded-full border border-white/10" aria-hidden />
        <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white/85">
              <Flame className="size-4 text-[#f0b765]" /> {c.hero.badge}
            </span>
            <h1 className="max-w-xl font-display text-5xl leading-[1.04] tracking-tight sm:text-6xl xl:text-7xl">
              {c.hero.title}
            </h1>
            <p className="max-w-xl text-base leading-8 text-white/70 sm:text-lg">{c.hero.subtitle}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#create"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f0b765] px-6 py-3.5 text-sm font-bold text-[#211811] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#ffd18a]"
              >
                <Camera className="size-4" /> {c.generator.title}
              </a>
              <a
                href="#examples"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {c.nav.examples} <ArrowRight className="size-4" />
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.hero.chips.map((chip) => (
                <span key={chip} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75">
                  <Check className="size-3.5 text-[#f0b765]" /> {chip}
                </span>
              ))}
            </div>
          </div>

          <div id="examples" className="scroll-mt-24">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-[#f0b765]">{c.hero.aiVersion}</p>
                <p className="mt-1 text-sm text-white/55">{c.hero.original}</p>
              </div>
              <span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-white/65">
                VISUAL REFERENCES
              </span>
            </div>

            {STYLES.length > 1 ? (
              <div role="tablist" aria-label={c.generator.stepStyle} className="mb-4 flex flex-wrap gap-2">
                {STYLES.map((s) => {
                  const active = s.id === style.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      id={'hero-tab-' + s.id}
                      aria-selected={active}
                      aria-controls="hero-panel"
                      tabIndex={active ? 0 : -1}
                      data-testid={'hero-tab-' + s.id}
                      onClick={() => setStyleId(s.id)}
                      onKeyDown={(event) => {
                        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                        if (!step) return
                        event.preventDefault()
                        const next = STYLES[(STYLES.indexOf(s) + step + STYLES.length) % STYLES.length]!
                        setStyleId(next.id)
                        document.getElementById('hero-tab-' + next.id)?.focus()
                      }}
                      className={
                        'rounded-full px-4 py-1.5 text-sm font-semibold transition ' +
                        (active ? 'bg-[#f0b765] text-[#211811]' : 'bg-white/5 text-white/65 ring-1 ring-white/15 hover:text-white')
                      }
                    >
                      {styleCopy(s.id).name}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div
              className="grid grid-cols-3 items-start gap-2.5 sm:gap-4"
              {...(STYLES.length > 1
                ? { id: 'hero-panel', role: 'tabpanel', 'aria-labelledby': 'hero-tab-' + style.id }
                : {})}
            >
              {heroClips.length ? (
                heroClips.map((clip, index) => (
                  <VideoCard
                    key={style.id + '-example-' + index}
                    video={clip.video}
                    poster={clip.poster}
                    credit={clip.credit}
                    label={clip.label}
                    className={
                      'min-w-0 ' +
                      (index === 1 ? 'mt-8 sm:mt-12' : index === 2 ? 'mt-4 sm:mt-6' : '') +
                      ' [&>div]:rounded-xl [&>div]:ring-white/10 [&>figcaption]:text-white/55'
                    }
                  />
                ))
              ) : (
                [c.hero.original, c.hero.aiVersion, c.hero.aiVersion].map((label, index) => (
                  <figure key={'empty-example-' + index} className="min-w-0">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10">
                      <div className="absolute inset-0 grid place-items-center">
                        <Film className="size-7 text-white/40" aria-hidden />
                      </div>
                    </div>
                    <figcaption className="mt-2 truncate text-center text-xs text-white/55">{label}</figcaption>
                  </figure>
                ))
              )}
            </div>
            <p className="mt-4 max-w-xl text-xs leading-5 text-white/55">{c.hero.creditNote}</p>
          </div>
        </div>
      </section>

      {/* 创作区：把上传入口和时长选择放在首屏之后，减少用户寻找操作入口的成本 */}
      <section id="create" className="scroll-mt-20 border-b border-line bg-bg-soft/55 py-16 sm:py-20">
        <div className="container-page grid items-start gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="space-y-6 lg:pt-5">
            <p className="eyebrow text-accent-text">{c.generator.title}</p>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">{c.madeWith.title}</h2>
            <p className="text-lg leading-8 text-muted">{c.madeWith.body}</p>
            <div className="grid grid-cols-3 gap-2">
              {site.durations.map((duration) => (
                <div key={duration.id} className="rounded-2xl border border-line bg-card p-3 sm:p-4">
                  <span className="block font-display text-2xl sm:text-3xl">{c.generator.seconds(duration.seconds)}</span>
                  <span className="mt-1 block text-xs text-muted">{c.generator.creditsLabel(duration.credits)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.hero.chips.map((chip) => (
                <span key={'create-' + chip} className="chip text-xs">{chip}</span>
              ))}
            </div>
          </div>
          <div className="w-full max-w-2xl lg:max-w-none">
            <Generator styleId={style.id} onStyleChange={setStyleId} />
          </div>
        </div>
      </section>

      {/* Problem：不用本站时的麻烦，文案设为 null 就不渲染 */}
      {c.problem ? (
        <section id="problem" className="scroll-mt-20 border-t border-line py-20">
          <div className="container-page">
            <p className="eyebrow text-accent-text">{c.problem.eyebrow}</p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">{c.problem.title}</h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {c.problem.items.map((item) => (
                <div key={item.title} className="card p-6">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-7 text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* With / Without：自己做和用本站逐行对比，文案设为 null 就不渲染 */}
      {c.withWithout ? (
        <section id="compare" className="scroll-mt-20 border-t border-line bg-bg-soft/60 py-20">
          <div className="container-page max-w-4xl">
            <p className="eyebrow text-accent-text">{c.withWithout.eyebrow}</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{c.withWithout.title}</h2>
            <table className="mt-10 w-full table-fixed overflow-hidden rounded-2xl bg-card text-left ring-1 ring-line">
              <thead>
                <tr className="border-b border-line text-sm">
                  <th scope="col" className="p-4 font-semibold text-muted">
                    {c.withWithout.without}
                  </th>
                  <th scope="col" className="p-4 font-semibold">
                    {c.withWithout.with}
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.withWithout.rows.map((row) => (
                  <tr key={row.with} className="border-b border-line last:border-0">
                    <td className="p-4 align-top text-muted">
                      <span className="flex items-start gap-2">
                        <X className="mt-1 size-4 shrink-0 text-rose-500" aria-hidden /> {row.without}
                      </span>
                    </td>
                    <td className="p-4 align-top">
                      <span className="flex items-start gap-2">
                        <Check className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden /> {row.with}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* How to：三步流程（关键词 H2；HowTo 富结果已下线，只用语义化有序列表） */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-line py-20">
        <div className="container-page">
          <p className="eyebrow text-accent-text">{c.howTo.eyebrow}</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">{c.howTo.title}</h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {c.howTo.steps.map((step, index) => (
              <li key={step.title} className="card p-6">
                <span className="font-display text-4xl text-accent">{index + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 leading-7 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-semibold">
            <a href="#create" className="btn-primary">
              {c.howTo.cta}
            </a>
            <LocalLink to={articlePath('howTo')} className="inline-flex items-center gap-1.5 hover:text-accent">
              {c.howTo.guide} <ArrowRight className="size-4" />
            </LocalLink>
          </div>
        </div>
      </section>

      {/* Made with：有真实示例素材后再显示照片 → 成片区块 */}
      {hasMadeWithExamples ? (
        <section id="photo-to-video" className="scroll-mt-20 border-t border-line bg-bg-soft/60 py-20">
          <div className="container-page grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-4">
              <p className="eyebrow text-accent-text">{c.madeWith.eyebrow}</p>
              <h2 className="font-display text-4xl leading-tight sm:text-5xl">{c.madeWith.title}</h2>
              <p className="max-w-md text-lg leading-8 text-muted">{c.madeWith.body}</p>
            </div>
            <div className="space-y-10">
              {STYLES.filter((s) => s.examples.madeWith.photo && s.examples.madeWith.video && s.examples.madeWith.poster).map((s) => (
                <div key={s.id} className="space-y-3" data-testid={`made-with-${s.id}`}>
                  {STYLES.length > 1 ? (
                    <p className="text-sm">
                      <span className="font-semibold">{styleCopy(s.id).name}</span>
                      <span className="text-muted"> · {styleCopy(s.id).tagline}</span>
                    </p>
                  ) : null}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <figure>
                      <img src={s.examples.madeWith.photo} alt={c.alt.inputPhoto} loading="lazy" className="aspect-[3/4] w-full rounded-2xl object-cover ring-1 ring-line" />
                      <figcaption className="mt-2 text-center text-xs text-muted">{c.madeWith.photoLabel}</figcaption>
                    </figure>
                    <ArrowRight className="size-6 text-muted" aria-hidden />
                    <div>
                      <VideoCard video={s.examples.madeWith.video} poster={s.examples.madeWith.poster} />
                      <p className="mt-2 text-center text-xs text-muted">{c.madeWith.resultLabel}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* What is：解释趋势本身，承接 "what is {keyword}" 信息型搜索 */}
      <section id="about" className="scroll-mt-20 py-20">
        <div className="container-page max-w-3xl">
          <p className="eyebrow text-accent-text">{c.whatIs.eyebrow}</p>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{c.whatIs.title}</h2>
          {c.whatIs.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-5 text-lg leading-8 text-muted">
              {paragraph}
            </p>
          ))}
          <LocalLink to={articlePath('trend')} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-accent">
            {c.whatIs.guide} <ArrowRight className="size-4" />
          </LocalLink>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-line py-20">
        <div className="container-page">
          <p className="eyebrow text-accent-text">{c.features.eyebrow}</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">{c.features.title}</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {c.features.items.map((item, index) => {
              const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length]!
              return (
                <div key={item.title} className="card p-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-bg-soft">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-7 text-muted">{item.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Ideas：保留创作场景说明，真实示例视频准备好后再添加媒体 */}
      <section className="border-t border-line py-20">
        <div className="container-page">
          <p className="eyebrow text-accent-text">{c.ideas.eyebrow}</p>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{c.ideas.title}</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {c.ideas.items.map((idea, index) => (
              <article key={idea.title} className="card p-6">
                <span className="font-display text-4xl text-accent">0{index + 1}</span>
                <h3 className="mt-4 font-display text-2xl">{idea.title}</h3>
                <p className="mt-3 leading-7 text-muted">{idea.body}</p>
                <a href="#create" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-accent">
                  {c.ideas.cta} <ArrowRight className="size-4" />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-t border-line bg-bg-soft/60 py-20">
        <div className="container-page">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="eyebrow text-accent-text">{c.pricing.eyebrow}</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">{c.pricing.title}</h2>
            <p className="mt-4 text-muted">{c.pricing.subtitle}</p>
          </div>
          <Pricing />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="container-page">
          <Faq />
        </div>
      </section>

      {/* Final CTA */}
      <section className="pb-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center text-ink-fg sm:px-12">
            <div
              className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(50%_60%_at_20%_0%,var(--accent),transparent_70%),radial-gradient(40%_50%_at_90%_100%,var(--accent-2),transparent_70%)]"
              aria-hidden
            />
            <div className="relative space-y-5">
              <h2 className="font-display text-4xl leading-tight sm:text-5xl">{c.finalCta.title}</h2>
              <p className="mx-auto max-w-xl opacity-80">{c.finalCta.body}</p>
              <a href="#create" className="btn mt-2 bg-ink-fg text-ink hover:opacity-90">
                {c.finalCta.cta} · {formatPrice(site.packages[0]!.priceCents, site.packages[0]!.currency)}+
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
