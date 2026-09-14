import { useEffect, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type Opts = { y?: number; delay?: number; start?: string }

/** Fade-up once when the element enters the viewport. Always cleans its trigger up (no leaks). */
export function useScrollReveal(ref: RefObject<HTMLElement | null>, { y = 40, delay = 0, start = 'top 85%' }: Opts = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tween = gsap.fromTo(
      el,
      { y: reduce ? 0 : y, opacity: 0 },
      { y: 0, opacity: 1, duration: reduce ? 0.01 : 0.8, delay, ease: 'power3.out', scrollTrigger: { trigger: el, start, once: true } },
    )
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [ref, y, delay, start])
}
