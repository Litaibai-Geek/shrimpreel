import { Volume2, VolumeX } from 'lucide-react'
import { Maximize, Minimize } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useContent } from '#/lib/i18n'

// 竖屏示例视频：进入视口自动静音播放，离开暂停；尊重“减少动态效果”设置
export function VideoCard({
  video,
  poster,
  label,
  credit,
  className = '',
}: {
  video: string
  poster: string
  label?: ReactNode
  credit?: string
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const c = useContent()

  function toggleSound() {
    const element = ref.current
    if (!element) return
    element.muted = !element.muted
    setMuted(element.muted)
    if (!element.muted && element.paused) void element.play().catch(() => {})
  }

  function toggleFullscreen() {
    const container = containerRef.current
    const video = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (!container || !video) return
    if (document.fullscreenElement === container) {
      void document.exitFullscreen().catch(() => {})
    } else if (container.requestFullscreen && document.fullscreenEnabled) {
      void container.requestFullscreen().catch(() => {})
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
    }
  }

  useEffect(() => {
    const video = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    setCanFullscreen(Boolean(document.fullscreenEnabled || video?.webkitEnterFullscreen))
    const update = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  useEffect(() => {
    setHydrated(true)
    const element = ref.current
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) element.play().catch(() => {})
        else element.pause()
      },
      { threshold: 0.35 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <figure className={className}>
      <div ref={containerRef} className={`relative overflow-hidden bg-bg-soft shadow-sm ring-1 ring-line ${fullscreen ? 'h-full w-full bg-black' : 'aspect-[9/16] rounded-2xl'}`}>
        <video
          ref={ref}
          src={video}
          poster={poster}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className={`size-full ${fullscreen ? 'object-contain' : 'object-cover'}`}
        />
        <button
          type="button"
          disabled={!hydrated}
          onClick={toggleSound}
          aria-label={muted ? c.video.unmute : c.video.mute}
          aria-pressed={!muted}
          className="absolute bottom-2 left-2 grid size-11 place-items-center rounded-full bg-black/75 text-white hover:bg-black focus-visible:outline-white"
        >
          {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
        </button>
        {canFullscreen ? (
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? c.video.exitFullscreen : c.video.fullscreen}
            className="absolute right-2 bottom-2 grid size-11 place-items-center rounded-full bg-black/75 text-white hover:bg-black focus-visible:outline-white">
            {fullscreen ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
          </button>
        ) : null}
        {label ? (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {label}
          </span>
        ) : null}
      </div>
      {credit ? <figcaption className="mt-2 truncate text-xs text-muted">{credit}</figcaption> : null}
    </figure>
  )
}
