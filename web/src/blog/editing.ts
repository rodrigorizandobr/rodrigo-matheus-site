import type { Body, Section } from './types'

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

export function nextRunHint(cfg: { generate_weekdays: number[]; generate_hour: number }): string {
  if (!cfg.generate_weekdays?.length) return 'Geração automática desligada — só gera quando você pedir.'
  const dias = cfg.generate_weekdays.map((d) => weekdayLabels()[d]).join(', ')
  return `Escreve sozinho em ${dias}, a partir das ${cfg.generate_hour}h.`
}
