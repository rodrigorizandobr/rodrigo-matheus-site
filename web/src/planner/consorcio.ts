import { valorPronto } from './planta'
import type { PlannerParams } from './types'

/** Prazo do grupo, em meses. */
export function planoDaCota(p: PlannerParams): { prazo: number } {
  return { prazo: Math.max(1, Math.round(p.consorcioPrazoMeses)) }
}

/** Taxa de administração + fundo de reserva do plano inteiro, em fração. */
export const taxaCons = (p: PlannerParams): number => p.consorcioTaxaTotalPct / 100

/** Carta de crédito base: um studio pronto à vista, com o desconto. */
export const cartaBase = (p: PlannerParams): number => valorPronto(0, p) * (1 - p.descontoAVista / 100)

/** Valor da carta no mês `m`: reajustada em degrau, uma vez por ano, pelo INCC. */
export const carta = (m: number, p: PlannerParams): number =>
  cartaBase(p) * Math.pow(1 + p.incc / 100, Math.floor((Math.max(1, m) - 1) / 12))

/** Parcela de uma cota no mês `m` enquanto o plano corre (sem lance). */
export const parcelaDaCota = (m: number, p: PlannerParams): number =>
  (1 / planoDaCota(p).prazo) * carta(m, p) * (1 + taxaCons(p))

/** Quantas parcelas faltam depois de um lance de `lance` (no mês `m`, com `fracaoPaga` já paga). */
export function parcelasRestantesAposLance(m: number, fracaoPaga: number, lance: number, p: PlannerParams): number {
  const cm = carta(m, p)
  const nova = Math.min(1, fracaoPaga + lance / (cm * (1 + taxaCons(p))))
  return Math.ceil((1 - nova) * planoDaCota(p).prazo - 1e-9)
}
