import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useI18n, I18nProvider } from './useI18n'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

describe('useI18n — mesmo comportamento do site atual', () => {
  it('idioma default é en (o site atual assume en quando não há localStorage.lang)', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('en')
    expect(result.current.t.nav.about).toBe('About')
  })

  it('respeita localStorage.lang = pt', () => {
    localStorage.setItem('lang', 'pt')
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('pt')
    expect(result.current.t.nav.about).toBe('Sobre')
  })

  it('setLang persiste, troca o dicionário e o <html lang>', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    act(() => result.current.setLang('pt'))
    expect(localStorage.getItem('lang')).toBe('pt')
    expect(result.current.t.nav.about).toBe('Sobre')
    expect(document.documentElement.lang).toBe('pt-BR')
  })

  it('valor inválido no localStorage cai para en', () => {
    localStorage.setItem('lang', 'klingon')
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('en')
  })
})

describe('idioma de quem chega pela primeira vez', () => {
  // o blog é a capa do site e o leitor vem do LinkedIn Brasil: sem escolha salva, vale o idioma do navegador
  it('navegador em português abre em português', () => {
    const spy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('pt-BR')
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('pt')
    spy.mockRestore()
  })

  it('a escolha salva vence o navegador', () => {
    localStorage.setItem('lang', 'en')
    const spy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('pt-BR')
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('en')
    spy.mockRestore()
  })
})
