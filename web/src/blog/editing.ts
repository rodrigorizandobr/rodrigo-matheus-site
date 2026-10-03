import type { Body, Post, PostStatus, Section } from './types'

/**
 * Manipulações puras do editor. Ficam fora do componente porque é aqui que se
 * perde conteúdo do autor: mover seção pela borda, apagar o índice errado,
 * transformar textarea em parágrafos. Tudo imutável — o React precisa da
 * identidade nova para re-renderizar, e o histórico de edição fica possível.
 */
const withSections = (body: Body, sections: Section[]): Body => ({ ...body, sections })

export const addSection = (body: Body): Body =>
  withSections(body, [...body.sections, { heading: '', paragraphs: [''] }])

export const removeSection = (body: Body, index: number): Body =>
  withSections(body, body.sections.filter((_, i) => i !== index))

/** `delta` -1 sobe, +1 desce. Fora da borda devolve o mesmo corpo. */
export function moveSection(body: Body, index: number, delta: number): Body {
  const target = index + delta
  if (target < 0 || target >= body.sections.length) return body
  const sections = [...body.sections]
  ;[sections[index], sections[target]] = [sections[target], sections[index]]
  return withSections(body, sections)
}

/** Uma textarea por seção: linha em branco separa parágrafos. */
export function setParagraphs(body: Body, index: number, text: string): Body {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return withSections(body, body.sections.map((s, i) => (i === index ? { ...s, paragraphs } : s)))
}

export const paragraphsToText = (section: Section): string => section.paragraphs.join('\n\n')

/**
 * Corpo do post num campo só. Editar quatro seções em oito caixas (duas línguas)
 * é insuportável; guardar HTML livre traz de volta o risco que as seções eliminam.
 * O meio-termo: UM texto, com `##` marcando título de seção e linha em branco
 * separando parágrafo — o que se grava continua sendo estrutura.
 */
export const sectionsToText = (sections: Section[]): string =>
  sections
    .map((s) => [s.heading ? `## ${s.heading}` : '', ...s.paragraphs].filter(Boolean).join('\n\n'))
    .join('\n\n')

export function textToSections(text: string): Section[] {
  const sections: Section[] = []
  let current: Section | null = null

  for (const bloco of (text || '').split(/\n\s*\n/)) {
    const trimmed = bloco.trim()
    if (!trimmed) continue

    const heading = trimmed.match(/^#{1,6}\s*(.*)$/)
    if (heading) {
      if (current) sections.push(current)
      current = { heading: heading[1].trim(), paragraphs: [] }
      continue
    }
    // quebra simples dentro do bloco é só respiro de digitação, não parágrafo novo
    const paragraph = trimmed.replace(/\s*\n\s*/g, ' ')
    if (!current) current = { heading: '', paragraphs: [] }
    current.paragraphs.push(paragraph)
  }
  if (current) sections.push(current)
  return sections
}

export type Edit = { text: string; start: number; end: number }

const HEADING = /^#{1,6}\s*/

/** Alterna `## ` nas linhas tocadas pela seleção. Todas já são título? Tira; senão, põe. */
export function toggleHeading(text: string, start: number, end: number): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', Math.max(end, start))
  const to = nl === -1 ? text.length : nl
  const lines = text.slice(from, to).split('\n')
  const allHeadings = lines.every((l) => HEADING.test(l))
  const next = lines.map((l) => (allHeadings ? l.replace(HEADING, '') : `## ${l.replace(HEADING, '')}`))
  const out = text.slice(0, from) + next.join('\n') + text.slice(to)
  const firstDelta = next[0].length - lines[0].length
  const total = next.join('\n').length - lines.join('\n').length
  return { text: out, start: Math.max(from, start + firstDelta), end: Math.max(from, end + total) }
}

/** Abre uma seção nova no cursor, com linha em branco antes e depois. */
export function insertSection(text: string, pos: number): Edit {
  const before = text.slice(0, pos).replace(/\s+$/, '')
  const after = text.slice(pos).replace(/^\s+/, '')
  const head = before ? `${before}\n\n` : ''
  const tail = after ? `\n\n${after}` : ''
  const out = `${head}## ${tail}`
  const cursor = head.length + 3
  return { text: out, start: cursor, end: cursor }
}

export const countWords = (text: string): number =>
  text.replace(/^#{1,6}\s*/gm, '').split(/\s+/).filter(Boolean).length

/** Mesmas regras do backend (api/blog/model.py): minúsculas, sem repetir, no máximo 6. */
export function parseTags(raw: string): string[] {
  const seen: string[] = []
  for (const tag of raw.split(',')) {
    const t = tag.trim().toLowerCase()
    if (t && !seen.includes(t)) seen.push(t)
  }
  return seen.slice(0, 6)
}

export const weekdayLabels = (): string[] => ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export function describeSchedule(cfg: { auto_publish: boolean; delay_days: number; publish_hour: number }): string {
  if (cfg.auto_publish) return 'Publica assim que o post é gerado.'
  const quando = cfg.delay_days === 0 ? 'no mesmo dia' : cfg.delay_days === 1 ? 'em 1 dia' : `em ${cfg.delay_days} dias`
  return `Fica agendado e entra no ar ${quando}, às ${cfg.publish_hour}h.`
}

/** Mesma agenda para escrever e para compartilhar no LinkedIn — não existe mais horário separado. */
export function nextRunHint(cfg: { generate_weekdays: number[]; generate_hour: number }): string {
  if (!cfg.generate_weekdays?.length) return 'Geração automática desligada — só gera quando você pedir.'
  const dias = cfg.generate_weekdays.map((d) => weekdayLabels()[d]).join(', ')
  return `Escreve e compartilha no LinkedIn em ${dias}, a partir das ${cfg.generate_hour}h ` +
    '(com um atraso aleatório de alguns minutos, para nunca cair no minuto exato).'
}

/** Pergunta de confirmação do "publicar no LinkedIn": avisa do que não dá para desfazer pelo painel. */
export function linkedinShareQuestion(post: { status: string; linkedinPostedAt?: string | null }): string {
  const avisos: string[] = []
  if (post.status !== 'published') {
    avisos.push('Este post ainda não está no ar: o link no LinkedIn vai levar a uma página que não existe até você publicá-lo.')
  }
  if (post.linkedinPostedAt) {
    avisos.push(`Este post já foi ao LinkedIn em ${post.linkedinPostedAt.slice(0, 10)}: publicar de novo cria um post repetido.`)
  }
  return ['Publicar este post no LinkedIn agora? Não dá para desfazer pelo painel.', ...avisos].join('\n\n')
}

export const statusLabel = (status: PostStatus): string =>
  ({ draft: 'rascunho', scheduled: 'agendado', published: 'no ar' })[status]

/** `2026-09-15T12:00:00Z` → `15/09/2026`. Só a parte da data: não depende do fuso de quem olha. */
export const formatDay = (iso: string | null | undefined): string => {
  const [y, m, d] = (iso || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}

/** Pergunta de confirmação do "excluir": diz o que sai do ar e o que NÃO se desfaz por aqui. */
export function deleteQuestion(post: Pick<Post, 'status' | 'linkedinPostedAt' | 'i18n'>): string {
  const title = post.i18n?.pt?.title || post.i18n?.en?.title || ''
  const avisos: string[] = []
  if (post.status === 'published') avisos.push('Ele está no ar: sai do site na hora, e o link deixa de funcionar.')
  if (post.status === 'scheduled') avisos.push('Ele está agendado e não será publicado.')
  if (post.linkedinPostedAt) {
    avisos.push(`O post de ${formatDay(post.linkedinPostedAt)} continua no LinkedIn: apagar aqui não o remove de lá.`)
  }
  const nome = title ? `“${title}”` : 'este post sem título'
  return [`Excluir ${nome} para sempre? Não dá para desfazer.`, ...avisos].join('\n\n')
}

/** Só o que o botão "salvar" grava: texto e tags. Estado, capa e LinkedIn têm ação própria. */
export const hasUnsavedChanges = (current: Pick<Post, 'i18n' | 'tags'>, saved: Pick<Post, 'i18n' | 'tags'>): boolean =>
  JSON.stringify([current.i18n, current.tags]) !== JSON.stringify([saved.i18n, saved.tags])

export const DISCARD_QUESTION = 'Há alterações que ainda não foram salvas. Sair e perdê-las?'
