/** Formatação de número para o simulador — puro, sem depender de locale do sistema. */
const full = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatBRL = (n: number): string => full.format(n)
export const formatBRLCompact = (n: number): string => compact.format(n)
export const formatPct = (n: number): string => `${percent.format(n)}%`
