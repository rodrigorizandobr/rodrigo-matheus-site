import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sectionFromHash } from './useHashLanding'

beforeEach(() => vi.restoreAllMocks())

describe('sectionFromHash — chegar em /#secao vindo de outra página', () => {
  it('reconhece uma seção conhecida', () => {
    expect(sectionFromHash('#about')).toBe('about')
    expect(sectionFromHash('#contact')).toBe('contact')
  })

  it('ignora hash vazio ou ausente', () => {
    expect(sectionFromHash('')).toBeNull()
    expect(sectionFromHash('#')).toBeNull()
  })

  it('ignora hash que não é seção — não inventa rolagem', () => {
    expect(sectionFromHash('#qualquer-coisa')).toBeNull()
    expect(sectionFromHash('#blog')).toBe('blog')
  })

  it('decodifica hash com escape', () => {
    expect(sectionFromHash('#%61bout')).toBe('about')
  })
})

describe('useHashLanding — a chegada não pode atropelar quem já está lendo', () => {
  it('desiste assim que a pessoa mexe na página', async () => {
    const { renderHook } = await import('@testing-library/react')
    const lenis = await import('../motion/lenis')
    const spy = vi.spyOn(lenis, 'scrollToId').mockImplementation(() => {})
    window.history.replaceState({}, '', '/#about')
    document.body.innerHTML = '<div id="about"></div>'
    vi.useFakeTimers()
    const { useHashLanding } = await import('./useHashLanding')

    renderHook(() => useHashLanding(true))
    window.dispatchEvent(new Event('wheel'))
    vi.advanceTimersByTime(3000)

    expect(spy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
