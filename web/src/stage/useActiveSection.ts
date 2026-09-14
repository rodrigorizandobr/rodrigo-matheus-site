import { useEffect, useState } from 'react'
import { resolveActive, REST_ID } from './sceneMachine'

/**
 * Which `[data-scene]` section owns the viewport's centre band right now.
 * One IntersectionObserver, a horizontal band from 40% to 60% of the viewport height.
 */
export function useActiveSection(): string {
  const [active, setActive] = useState<string>(REST_ID)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'))
    const ratios = new Map<string, number>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) ratios.set((e.target as HTMLElement).dataset.scene!, e.isIntersecting ? e.intersectionRatio : 0)
      setActive((cur) => resolveActive([...ratios].map(([id, ratio]) => ({ id, ratio })), cur, 0.001))
    }, { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return active
}
