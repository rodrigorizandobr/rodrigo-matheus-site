import type { PlannerParams } from './types'

/** IRPJ (15% × 32%) + CSLL (9% × 32%) sobre a receita de aluguel, lucro presumido. */
export const IRPJ_CSLL_PRESUMIDO = 7.68
/** Redutor social: R$ por imóvel residencial por mês, valor de 2027, corrigido pelo IPCA. */
export const REDUTOR_SOCIAL = 600
/**
 * Tributo sobre o consumo no aluguel residencial de longa duração, % da base, já com a redução de
 * 70%. Até 2026 é PIS/Cofins (sem redutor social). Estimativas publicadas em nov/2026 (ver
 * specs/001-imoveis-realismo-2026/referencias-2026.md) — a alíquota de referência ainda depende do Senado.
 */
export const CONSUMO_LONGA: readonly (readonly [number, number])[] = [
  [2026, 3.65], [2028, 3.39], [2029, 3.89], [2030, 4.39], [2031, 4.89], [2032, 5.39], [Infinity, 8.4],
]

export function aliquotaConsumoLonga(ano: number): number {
  for (const [ate, pct] of CONSUMO_LONGA) if (ano <= ate) return pct
  return CONSUMO_LONGA[CONSUMO_LONGA.length - 1][1]
}

export function redutorSocial(ano: number, ipcaAno: number): number {
  if (ano < 2027) return 0
  return REDUTOR_SOCIAL * Math.pow(1 + ipcaAno / 100, ano - 2027)
}

/**
 * Imposto de UM mês de UMA unidade. `aluguelCheio` é o aluguel do mês ocupado; `ocupada` é a fração
 * do ano com inquilino (1 − vacância). Sem ano (ou modo fixo) vale o `impostoHolding` de sempre.
 */
export function impostoAluguelLonga(aluguelCheio: number, ocupada: number, ano: number | undefined, p: PlannerParams): number {
  if (p.impostoModo === 'fixo' || ano === undefined) return aluguelCheio * ocupada * (p.impostoHolding / 100)
  const base = Math.max(0, aluguelCheio - redutorSocial(ano, p.ipca))
  return ocupada * (aluguelCheio * (IRPJ_CSLL_PRESUMIDO / 100) + base * (aliquotaConsumoLonga(ano) / 100))
}
