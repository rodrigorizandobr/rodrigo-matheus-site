import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useScrollReveal } from './useScrollReveal'

gsap.registerPlugin(ScrollTrigger)

function Card() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollReveal(ref)
  return <div ref={ref}>card</div>
}

describe('useScrollReveal — registra 1 ScrollTrigger por elemento e limpa no unmount', () => {
  it('sem leak: getAll() volta a 0 depois do unmount', () => {
    // jsdom lays everything out at top:0, which is already past "top 85%" — the trigger would
    // fire on creation and self-kill (once:true). Put the cards far below the fold instead.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5000, bottom: 5100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 5000, toJSON: () => ({}),
    } as DOMRect)

    const before = ScrollTrigger.getAll().length
    const { unmount } = render(<><Card /><Card /></>)
    expect(ScrollTrigger.getAll().length).toBe(before + 2)
    unmount()
    expect(ScrollTrigger.getAll().length).toBe(before)
  })
})
