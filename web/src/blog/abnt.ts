import type { Lang, Post, Reference } from './types'

/**
 * Referências no fim do post, em ABNT (NBR 6023:2018) para documento on-line:
 *
 *   AUTOR. Título. Disponível em: URL. Acesso em: 14 set. 2026.
 *
 * O "autor" é o site — é o que se usa quando a matéria não traz autor assinado,
 * que é o caso da maioria do que a pesquisa encontra. Nada aqui é inventado: se
 * não há título ou data de acesso, o trecho simplesmente não sai.
 */
const MESES_PT = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
const MESES_EN = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.']

const ROTULOS: Record<Lang, { available: string; accessed: string; title: string }> = {
  pt: { available: 'Disponível em', accessed: 'Acesso em', title: 'Referências' },
  en: { available: 'Available at', accessed: 'Accessed on', title: 'References' },
}

export const referencesTitle = (lang: Lang) => ROTULOS[lang].title

/** Domínio sem `www`/`www1` — mesmo cálculo de api/blog/research.py. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\d*\./, '')
  } catch {
    return ''
  }
}

function accessDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const meses = lang === 'pt' ? MESES_PT : MESES_EN
  return `${d.getUTCDate()} ${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function abntReference(ref: Reference, lang: Lang): string {
  const rotulos = ROTULOS[lang]
  const autor = (ref.site || siteOf(ref.url)).toUpperCase()
  const titulo = (ref.title || '').trim()

  const partes = [autor ? `${autor}.` : '']
  if (titulo) partes.push(titulo.endsWith('.') ? titulo : `${titulo}.`)
  partes.push(`${rotulos.available}: ${ref.url}.`)

  const acesso = accessDate(ref.accessedAt || '', lang)
  if (acesso) partes.push(`${rotulos.accessed}: ${acesso}.`)

  return partes.filter(Boolean).join(' ')
}

/**
 * Referências de um post. Posts gerados antes desta mudança só têm `sources`
 * (URLs); ainda assim recebem citação — com o site tirado da própria URL.
 */
export function referencesOf(post: Post): Reference[] {
  const fromRefs = post.references ?? []
  const fromUrls = (post.sources ?? []).map((url) => ({ url, title: '', site: siteOf(url), accessedAt: '' }))
  const todas = fromRefs.length > 0 ? fromRefs : fromUrls

  const vistas = new Set<string>()
  return todas.filter((r) => r.url && !vistas.has(r.url) && vistas.add(r.url))
}
