/**
 * Os marcos da linha da carreira. Empresa e ano escolhem o item do currículo (i18n); o texto do cargo
 * vem de lá, para não existir uma segunda cópia. `level` é a altura do ponto na linha (senioridade),
 * a única coisa que o currículo não diz. `career.test.ts` quebra se um marco deixar de existir no i18n.
 */
export const MILESTONES = [
  { company: 'Ponto ED', year: 2005, level: 1 },
  { company: 'Universia', year: 2006, level: 2 },
  { company: 'GoNow', year: 2008, level: 3 },
  { company: 'Serasa Experian', year: 2012, level: 4 },
  { company: 'Serasa Experian', year: 2015, level: 5 },
  { company: 'Itaú Unibanco', year: 2019, level: 6 },
  { company: 'Natura &Co', year: 2019, level: 7 },
  { company: 'Casas Bahia Pay', year: 2024, level: 8 },
  { company: 'Digio', year: 2026, level: 8 },
] as const

export const MAX_LEVEL = 8

export type Marco = { company: string; role: string; year: number; /** ano com fração do mês, para o eixo */ when: number; level: number }
type Item = { company: string; role: string; period: string }

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
}

/** "setembro de 2019 → agosto de 2021" ou "September 2019 → August 2021" → 2019,67. */
export function startOf(period: string): number {
  const start = period.split('→')[0]
  const year = Number(start.match(/\d{4}/)?.[0] ?? NaN)
  const word = start.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]{3}/)?.[0] ?? ''
  return year + ((MONTHS[word] ?? 1) - 1) / 12
}

export function marcos(items: readonly Item[]): Marco[] {
  const out: Marco[] = []
  for (const m of MILESTONES) {
    const item = items.find((i) => i.company === m.company && Math.floor(startOf(i.period)) === m.year)
    if (item) out.push({ company: item.company, role: item.role, year: m.year, when: startOf(item.period), level: m.level })
  }
  return out
}
