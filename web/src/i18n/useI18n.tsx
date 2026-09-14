import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import en from './en.json'
import pt from './pt.json'
import type { Dictionary, Lang } from './types'

const DICT: Record<Lang, Dictionary> = { en, pt: pt as Dictionary }
const HTML_LANG: Record<Lang, string> = { en: 'en', pt: 'pt-BR' }
const STORAGE_KEY = 'lang' // same key the current site (and its GA events) use

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt'

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

type I18nValue = { lang: Lang; t: Dictionary; setLang: (l: Lang) => void }
const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang]
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* private mode — in-memory only */
    }
    setLangState(l)
  }, [])

  const value = useMemo(() => ({ lang, t: DICT[lang], setLang }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
