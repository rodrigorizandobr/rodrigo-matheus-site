import { useEffect, useRef, useState, type RefObject } from 'react'

/** Motion budget the visitor asked for: no video under reduced-motion or Save-Data. */
export function useMotionAllowed(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    setOk(!reduce && !saveData)
  }, [])
  return ok
}

/**
 * Play a <video> only while its host is (nearly) on screen; pause otherwise. `preload="none"` in
 * markup + `load()` here means bytes are fetched only when the band approaches the viewport.
 */
export function useInViewPlayback(host: RefObject<HTMLElement | null>, video: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const loaded = useRef(false)
  useEffect(() => {
    const el = host.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      const v = video.current
      if (!v) return
      if (e.isIntersecting) {
        if (!loaded.current) { loaded.current = true; v.load() }
        v.play().catch(() => {})
      } else {
        v.pause()
      }
    }, { rootMargin: '25% 0px', threshold: 0.01 })
    io.observe(el)
    return () => io.disconnect()
  }, [host, video, enabled])
}
