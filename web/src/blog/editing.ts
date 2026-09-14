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
