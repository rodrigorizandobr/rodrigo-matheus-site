import { useEffect, useRef, useState } from 'react'
import type { Dictionary } from '../../i18n/types'

/**
 * The hero character, full-bleed behind the HUD. Layers, bottom to top:
 *   1. still  — art-directed <picture> (wide clean-room crop ≥768px, 4:5 bust below). Always present; it is the LCP.
 *   2. video  — the same character, an 8s Veo idle loop rendered as a forward+reverse palindrome so the
 *               seam is invisible. Desktop only, never with reduced-motion or Save-Data, fades in on canplay.
 *   3. glow / scan / vignette — CSS.
 * Motion on the layers is pointer parallax via CSS vars.
 */
export function HeroPortrait({ hud }: { hud: Dictionary['hud'] }) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [video, setVideo] = useState(false)
  const [wantVideo, setWantVideo] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    setWantVideo(desktop && !reduce && !saveData)
  }, [])

  useEffect(() => {
    const el = host.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    let raf = 0
    let tx = 0, ty = 0, x = 0, y = 0
    const tick = () => {
      x += (tx - x) * 0.07
      y += (ty - y) * 0.07
      el.style.setProperty('--px', `${(-x * 18).toFixed(2)}px`)
      el.style.setProperty('--py', `${(-y * 12).toFixed(2)}px`)
      raf = Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1
      ty = (e.clientY / window.innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div ref={host} className="portrait relative h-[42svh] overflow-hidden" data-ready={ready} data-video={video} aria-hidden="true">
      <picture>
        <source media="(min-width: 768px)" srcSet="/hero/hero-wide-1280.webp 1280w, /hero/hero-wide-1920.webp 1920w" sizes="100vw" />
        <img
          src="/hero/hero-tall-900.webp"
          srcSet="/hero/hero-tall-640.webp 640w, /hero/hero-tall-900.webp 900w"
          sizes="100vw"
          alt=""
          fetchPriority="high"
          decoding="async"
          onLoad={() => setReady(true)}
          className="portrait-img"
        />
      </picture>
      {wantVideo && (
        <video
          className="portrait-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          onCanPlay={() => setVideo(true)}
          onError={() => setVideo(false)}
        >
          <source src="/hero/idle.webm" type="video/webm" />
          <source src="/hero/idle.mp4" type="video/mp4" />
        </video>
      )}
      <div className="portrait-glow" />
      <div className="portrait-scan" />
      <div className="portrait-vignette" />
      <p className="sr-only">{hud.robot_alt}</p>
    </div>
  )
}
