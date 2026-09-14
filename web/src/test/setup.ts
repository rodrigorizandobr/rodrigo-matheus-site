import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// matchMedia is not in jsdom and GSAP's ScrollTrigger calls it at import time — install before any test module loads
// Reduced motion is ON in tests: count-ups and reveals resolve instantly, so assertions are deterministic.
window.matchMedia = window.matchMedia ?? ((q: string) => ({
  matches: /prefers-reduced-motion/.test(q), media: q, onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
}) as unknown as MediaQueryList)

// jsdom has no IntersectionObserver; sections use it for reveal + GA section_view
class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } root = null; rootMargin = ''; thresholds = [] }
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO

beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = ''
  // GA4 stub — tests assert on this
  ;(window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
