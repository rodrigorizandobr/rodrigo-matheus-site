import type { PlannerParams } from './types'

/** Preço de tabela de um lançamento no mês `mes` (INCC composto sobre o preço de hoje). */
export const precoLancamento = (mes: number, p: PlannerParams): number =>
  p.custoStudio * Math.pow(1 + p.incc / 100, mes / 12)

/** Valor de mercado de um studio PRONTO equivalente, no mês `mes`: o lançamento mais o ágio. */
export const valorPronto = (mes: number, p: PlannerParams): number =>
  precoLancamento(mes, p) * (1 + p.agioProntoPct / 100)

/** Preço de contrato de quem compra hoje com `r` meses de obra pela frente (r = prazoObra → lançamento; r = 0 → pronto). */
export const precoNaObra = (mes: number, r: number, prazoObra: number, p: PlannerParams): number =>
  precoLancamento(mes, p) * (1 + (p.agioProntoPct / 100) * (1 - Math.min(1, r / prazoObra)))

/** A n-ésima entrega da planta (1, 2, 3…) é vendida nas chaves? `pct` de 0 a 100. */
export const vendeNasChaves = (n: number, pct: number): boolean =>
  Math.floor((n * pct) / 100) > Math.floor(((n - 1) * pct) / 100)

/**
 * O que sobra para quem vende nas chaves, antes de a escritura sair no nome do vendedor (sem ITBI nem
 * cartório): valor de mercado na entrega menos corretagem e imposto, menos o que ainda se deve à construtora.
 */
export function liquidoVendaNasChaves(valorNaEntrega: number, devidoParcelas: number, saldoFinanciado: number, p: PlannerParams): number {
  const atrito = (p.corretagemVendaPct + p.impostoVendaPct) / 100
  return valorNaEntrega * (1 - atrito) - devidoParcelas - saldoFinanciado
}
