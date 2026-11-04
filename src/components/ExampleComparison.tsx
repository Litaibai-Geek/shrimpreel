import { VideoCard } from '#/components/VideoCard'
import { useContent } from '#/lib/i18n'

// 使用同一次生成的输入人像和成片，展示前后对照。
export function ExampleComparison({ photo, video, poster }: { photo: string; video: string; poster: string }) {
  const c = useContent()
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4" data-testid="example-comparison">
      <figure>
        <div className="aspect-[9/16] overflow-hidden rounded-2xl bg-bg-soft ring-1 ring-line">
          <img src={photo} alt={c.madeWith.photoLabel} className="size-full object-cover" />
        </div>
        <figcaption className="mt-2 text-center text-sm font-medium text-muted">{c.madeWith.photoLabel}</figcaption>
      </figure>
      <div>
        <VideoCard video={video} poster={poster} label={c.madeWith.resultLabel} />
        <p className="mt-2 text-center text-sm font-medium text-muted">{c.madeWith.resultLabel}</p>
      </div>
    </div>
  )
}
