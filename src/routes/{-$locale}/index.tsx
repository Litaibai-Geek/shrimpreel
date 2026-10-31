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
      {/* Hero：左侧生成器，右侧展示三段有授权的表演参考素材 */}
      <section className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="container-page relative grid gap-y-5 py-10 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:gap-x-16 lg:gap-y-5 lg:py-14">
          {/* Desktop: a shared grid row keeps the generator and videos aligned in Solo and Band modes.
              Mobile order retains heading → generator → badge → previews. */}
          <div className="order-1 space-y-5">
            <h1 className="font-display text-5xl leading-[1.04] tracking-tight sm:text-6xl">{c.hero.title}</h1>
            <p className="text-lg leading-8 text-muted">{c.hero.subtitle}</p>
          </div>
          <div className="order-2 min-w-0 lg:order-3" id="create">
            <Generator styleId={style.id} onStyleChange={setStyleId} />
          </div>
          <div className="order-3 flex items-start lg:order-2 lg:items-end">
            <span className="chip w-fit">
              <Flame className="size-4 text-accent" /> {c.hero.badge}
            </span>
          </div>
          <div className="order-4 flex min-w-0 flex-col gap-5">
            {STYLES.length > 1 ? (
              <div role="tablist" aria-label={c.generator.stepStyle} className="flex flex-wrap gap-2">
                {STYLES.map((s) => {
                  const active = s.id === style.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      id={`hero-tab-${s.id}`}
                      aria-selected={active}
                      aria-controls="hero-panel"
                      tabIndex={active ? 0 : -1}
                      data-testid={`hero-tab-${s.id}`}
                      onClick={() => setStyleId(s.id)}
                      onKeyDown={(event) => {
                        // 左右方向键在标签间移动并选中
                        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                        if (!step) return
                        event.preventDefault()
                        const next = STYLES[(STYLES.indexOf(s) + step + STYLES.length) % STYLES.length]!
                        setStyleId(next.id)
                        document.getElementById(`hero-tab-${next.id}`)?.focus()
                      }}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? 'bg-ink text-ink-fg' : 'bg-bg-soft text-muted ring-1 ring-line hover:text-fg'}`}
                    >
                      {styleCopy(s.id).name}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div
              className="grid grid-cols-3 gap-3 sm:gap-4"
              {...(STYLES.length > 1 ? { id: 'hero-panel', role: 'tabpanel', 'aria-labelledby': `hero-tab-${style.id}` } : {})}
            >
              {heroClips.length ? (
                heroClips.map((clip, index) => (
                  <VideoCard
                    key={`${style.id}-example-${index}`}
                    video={clip.video}
                    poster={clip.poster}
                    credit={clip.credit}
                    label={clip.label}
                  />
                ))
              ) : (
                [c.hero.original, c.hero.aiVersion, c.hero.aiVersion].map((label, index) => (
                  <figure key={`empty-example-${index}`}>
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-bg-soft ring-1 ring-line">
                      <div className="absolute inset-0 grid place-items-center">
                        <Film className="size-7 text-muted/60" aria-hidden />
                      </div>
                    </div>
                    <figcaption className="mt-2 truncate text-center text-xs text-muted">{label}</figcaption>
                  </figure>
                ))
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {c.hero.chips.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
            <p className="text-center text-xs text-muted">{c.hero.creditNote}</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-medium">
              <LocalLink to={articlePath('trend')} className="inline-flex items-center gap-1.5 hover:text-accent">
                {c.articles.trend.title} <ArrowRight className="size-4" />
              </LocalLink>
              <LocalLink to={articlePath('howTo')} className="inline-flex items-center gap-1.5 hover:text-accent">
                {c.articles.howTo.title} <ArrowRight className="size-4" />
              </LocalLink>
            </div>
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
        <section id="examples" className="scroll-mt-20 border-t border-line bg-bg-soft/60 py-20">
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
