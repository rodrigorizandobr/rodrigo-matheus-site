import type { PlannerParams } from './types'

export type Parcela = { k: number; pct: number; tipo: 'entrada' | 'mensal' | 'reforco' | 'chaves' }

/** % do preço pago até as chaves: o `pctPagoChaves` do modo simples, ou a soma dos quatro do contrato. */
export const pctAteChaves = (p: PlannerParams): number =>
  p.cronograma === 'contrato' ? p.entradaPct + p.mensaisPct + p.reforcoPct + p.chavesPct : p.pctPagoChaves

/** O que fica para depois das chaves. */
export const posChavesPct = (p: PlannerParams): number => Math.max(0, 100 - pctAteChaves(p))

/** Meses em que o resto é parcelado depois das chaves. */
export const prazoPosChaves = (p: PlannerParams): number =>
  p.cronograma === 'contrato' ? Math.max(1, Math.round(p.posChavesMeses)) : 48

/** As parcelas de um contrato fechado hoje com `r` meses de obra pela frente (r = 0: pronto). */
export function cronograma(r: number, p: PlannerParams): Parcela[] {
  const ate = pctAteChaves(p)
  if (r <= 0) return [{ k: 0, pct: ate, tipo: 'entrada' }]
  const parcelas: Parcela[] = [{ k: 0, pct: p.entradaPct, tipo: 'entrada' }]
  for (let k = 1; k <= r; k++) parcelas.push({ k, pct: p.mensaisPct / r, tipo: 'mensal' })
  const cada = Math.max(1, Math.round(p.reforcoCadaMeses))
  const n = Math.floor((r - 1) / cada)
  for (let i = 1; i <= n; i++) parcelas.push({ k: cada * i, pct: p.reforcoPct / n, tipo: 'reforco' })
  parcelas.push({ k: r, pct: p.chavesPct + (n === 0 ? p.reforcoPct : 0), tipo: 'chaves' })
  return parcelas
}
