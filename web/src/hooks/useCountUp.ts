import { useEffect, useState } from 'react'
import gsap from 'gsap'

/** Number that counts from 0 to `target` on mount / change. Honours reduced-motion. */
export function useCountUp(target: number, duration = 0.9): number {
  const [value, setValue] = useState(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? target : 0))
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return }
    const o = { v: 0 }
    const tw = gsap.to(o, { v: target, duration, ease: 'power3.out', onUpdate: () => setValue(Math.round(o.v)) })
    return () => { tw.kill() }
  }, [target, duration])
  return value
}
