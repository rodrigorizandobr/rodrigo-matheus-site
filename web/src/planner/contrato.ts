import type { Inicio } from './calendario'
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

/** O que o modo automático precisa saber do fluxo da pessoa no dia da compra. */
export type ContextoCronograma = {
  mes: number
  inicio: Inicio
  /** Aporte mensal do bolso (já com a queda de parcela do apê). */
  aporteMensal: number
  aporteAnual: number
  mesTransicao: number
}

/**
 * As parcelas de um contrato fechado hoje com `r` meses de obra pela frente (r = 0: pronto).
 *
 * O que vai até as chaves é entrada + parcelado + chaves. No modo MANUAL o parcelado são as mensais e os
 * reforços periódicos dos campos. No AUTOMÁTICO o total parcelado é o mesmo, mas a divisão entre mensais e
 * reforços sai do fluxo: os reforços caem no mês do bônus (`annualMonth`) e levam a fatia que o bônus
 * consegue pagar, as mensais levam o resto. Sem bônus no caminho, ou sem fluxo nenhum, tudo vira mensal.
 */
export function cronograma(r: number, p: PlannerParams, ctx?: ContextoCronograma): Parcela[] {
  const ate = pctAteChaves(p)
  if (r <= 0) return [{ k: 0, pct: ate, tipo: 'entrada' }]
  const parcelas: Parcela[] = [{ k: 0, pct: p.entradaPct, tipo: 'entrada' }]

  if (p.parcelamento === 'automatico' && ctx) {
    const parcelado = p.mensaisPct + p.reforcoPct
    const mesDoAno = (m: number) => ((ctx.inicio.mes - 1 + m - 1) % 12) + 1
    let capMensal = 0
    let capAnual = 0
    const meses: number[] = []
    for (let k = 1; k <= r; k++) {
      const m = ctx.mes + k
      if (m <= ctx.mesTransicao) capMensal += ctx.aporteMensal
      if (k <= r - 1 && mesDoAno(m) === p.annualMonth) {
        meses.push(k)
        if (m <= ctx.mesTransicao) capAnual += ctx.aporteAnual
      }
    }
    const total = capMensal + capAnual
    const parteAnual = meses.length === 0 ? 0 : total > 0 ? capAnual / total : parcelado > 0 ? p.reforcoPct / parcelado : 0
    const reforco = parcelado * parteAnual
    for (let k = 1; k <= r; k++) parcelas.push({ k, pct: (parcelado - reforco) / r, tipo: 'mensal' })
    if (reforco > 1e-12) for (const k of meses) parcelas.push({ k, pct: reforco / meses.length, tipo: 'reforco' })
    parcelas.push({ k: r, pct: p.chavesPct, tipo: 'chaves' })
    return parcelas
  }

  for (let k = 1; k <= r; k++) parcelas.push({ k, pct: p.mensaisPct / r, tipo: 'mensal' })
  const cada = Math.max(1, Math.round(p.reforcoCadaMeses))
  const n = Math.floor((r - 1) / cada)
  if (p.reforcoPct > 0) for (let i = 1; i <= n; i++) parcelas.push({ k: cada * i, pct: p.reforcoPct / n, tipo: 'reforco' })
  parcelas.push({ k: r, pct: p.chavesPct + (n === 0 ? p.reforcoPct : 0), tipo: 'chaves' })
  return parcelas
}
