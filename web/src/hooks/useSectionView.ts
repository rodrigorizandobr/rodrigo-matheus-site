import { useEffect, type RefObject } from 'react'
import { gaEvt } from '../analytics/ga'

/** Fires GA `section_view {section}` once, when 40% of the section is on screen — same event name as v2. */
export function useSectionView(ref: RefObject<HTMLElement | null>, id: string) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { gaEvt('section_view', { section: id }); io.disconnect() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, id])
}
