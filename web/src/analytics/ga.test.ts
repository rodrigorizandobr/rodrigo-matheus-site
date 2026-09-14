import { describe, it, expect, vi } from 'vitest'
import { gaEvt } from './ga'

describe('gaEvt — paridade com o gaEvt() do site atual', () => {
  it('chama gtag("event", nome, params) e injeta language a partir do localStorage.lang', () => {
    localStorage.setItem('lang', 'pt')
    gaEvt('class_select', { class: 'fintech' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'class_select', { class: 'fintech', language: 'pt' })
  })

  it('sem localStorage.lang, language = en', () => {
    gaEvt('cta_start')
    expect(window.gtag).toHaveBeenCalledWith('event', 'cta_start', { language: 'en' })
  })

  it('sem gtag (bloqueador de anúncios) não explode', () => {
    ;(window as unknown as { gtag?: unknown }).gtag = undefined
    expect(() => gaEvt('cta_start')).not.toThrow()
  })

  it('não muta o objeto de params do chamador', () => {
    const params = { class: 'x' }
    gaEvt('class_select', params)
    expect(params).toEqual({ class: 'x' })
    vi.restoreAllMocks()
  })
})
