/** Datas e valores curtos da home, nos dois idiomas. Dia sempre no fuso de São Paulo, como o blog agenda. */
import type { Lang } from '../i18n/types'

const TZ = 'America/Sao_Paulo'

export function shortDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  if (lang === 'en') return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(d)
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month').replace('.', '')} ${get('year')}`
}

/** Valor grande, curto: "R$ 819 mil", "R$ 1,8 mi" — o que cabe numa manchete. */
export function brl(value: number, lang: Lang): string {
  const v = Math.max(0, value)
  if (v >= 1e6) return lang === 'pt' ? `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi` : `R$ ${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return lang === 'pt' ? `R$ ${Math.round(v / 1e3)} mil` : `R$ ${Math.round(v / 1e3)}K`
  return `R$ ${Math.round(v)}`
}

/** Valor inteiro com separador de milhar: "4.000" em pt, "4,000" em en. */
export const whole = (value: number, lang: Lang): string =>
  new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 }).format(value)
