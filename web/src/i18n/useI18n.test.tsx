import { describe, it, expect } from 'vitest'
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
