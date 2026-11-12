import { fatorPreco } from './inflacao'
import type { PlannerParams } from './types'

export const DIAS_POR_MES = 365 / 12
export type Conta = { bruto: number; custos: number; liquido: number }

/** O mês de UMA unidade em temporada que vale `valor`, no mês `mes` do plano (diária e contas sobem com o IPCA). */
export function contaTemporada(valor: number, mes: number, p: PlannerParams): Conta {
  const preco = fatorPreco(mes, p.ipca)
  const bruto = p.diariaHoje * preco * DIAS_POR_MES * (p.ocupacaoPct / 100)
  const plataforma = bruto * (p.taxaPlataformaPct / 100)
  const gestao = (bruto - plataforma) * (p.taxaGestaoPct / 100)
  const imposto = bruto * (p.impostoTemporadaPct / 100)
  // em temporada condomínio e IPTU são SEMPRE do dono
  const condominio = (valor * p.condominioPctAno) / 100 / 12
  const iptu = (valor * p.iptuPctAno) / 100 / 12
  const fixos = p.custoFixoTemporadaMes * preco
  const manutencao = (valor * p.manutencaoTemporadaPctAno) / 100 / 12
  const custos = plataforma + gestao + imposto + condominio + iptu + fixos + manutencao
  return { bruto, custos, liquido: bruto - custos }
}

/**
 * Um studio que vale `p.custoStudio` hoje, nos dois modos de locação — e a ocupação (em %) em que
 * a temporada empata com o aluguel tradicional. `Infinity` quando as taxas comem a diária inteira.
 */
export function comparaLocacao(
  p: PlannerParams, longa: (valor: number) => { liquido: number; custos: number },
): { longa: Conta; temporada: Conta; ocupacaoDeEquilibrio: number } {
  const l = longa(p.custoStudio)
  const t = contaTemporada(p.custoStudio, 0, p)
  const plat = p.taxaPlataformaPct / 100
  const gest = p.taxaGestaoPct / 100
  const imp = p.impostoTemporadaPct / 100
  const A = p.diariaHoje * DIAS_POR_MES * (1 - plat - (1 - plat) * gest - imp)
  const B = (p.custoStudio * (p.condominioPctAno + p.iptuPctAno + p.manutencaoTemporadaPctAno)) / 100 / 12 + p.custoFixoTemporadaMes
  return {
    longa: { bruto: l.liquido + l.custos, custos: l.custos, liquido: l.liquido },
    temporada: t,
    ocupacaoDeEquilibrio: A <= 0 ? Infinity : ((l.liquido + B) / A) * 100,
  }
}
