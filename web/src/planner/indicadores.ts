import { rendaDaUnidade, taxaMensal } from './calc'
import { custoAnualDoCredito } from './credito'
import type { MonthRow, PlannerParams } from './types'

/**
 * O primeiro mês (campo `mes`) em que a renda disponível cobre a meta E continua cobrindo por 12 meses
 * seguidos (ou até o fim do diário, se faltarem menos de 12). `null` se nunca acontece ou se não há meta.
 */
export function mesDaMeta(linhas: MonthRow[]): number | null {
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].metaDoMes <= 0 || linhas[i].rendaDisponivel < linhas[i].metaDoMes) continue
    let firme = true
    for (let j = i; j < Math.min(linhas.length, i + 12); j++) {
      if (linhas[j].rendaDisponivel < linhas[j].metaDoMes) { firme = false; break }
    }
    if (firme) return linhas[i].mes
  }
  return null
}

/** Dívida de financiamento sobre o valor dos imóveis prontos. */
export const alavancagem = (l: MonthRow): number => (l.valorImoveis > 0 ? l.dividaFinanciamento / l.valorImoveis : 0)

/** Quantas vezes o aluguel líquido cobre as parcelas de financiamento. `null` sem parcelas. */
export const cobertura = (l: MonthRow): number | null =>
  l.totalParcelasFinanciamento > 0 ? l.rendaMensalLiquida / l.totalParcelasFinanciamento : null

export function spreadAlavancagem(p: PlannerParams, ano: number): {
  retornoAluguel: number
  valorizacao: number
  retornoImovel: number
  custoCredito: number
  spread: number
} {
  const retornoAluguel = (12 * rendaDaUnidade(p.custoStudio, 0, ano, p).liquido / p.custoStudio) * 100
  const valorizacao = p.incc - p.depreciacao
  // O saldo parcelado depois das chaves corre pelo IPCA e não tem juros: esse é o custo da dívida.
  const custoCredito = p.cronograma === 'contrato' ? custoAnualDoCredito(0, p.correcaoPosChavesAno) : custoAnualDoCredito(p.jurosFinHolding, 0)
  const retornoImovel = retornoAluguel + valorizacao
  return { retornoAluguel, valorizacao, retornoImovel, custoCredito, spread: retornoImovel - custoCredito }
}

/**
 * O saldo, mês a mês, de quem pusesse na renda fixa exatamente o dinheiro que entrou no plano (o que já
 * foi pago + aportes) e fizesse as mesmas retiradas. Um valor por linha do diário. O FGTS fica de fora.
 */
export function benchmarkRendaFixa(linhas: MonthRow[], p: PlannerParams): number[] {
  const taxa = taxaMensal(p.rendimentoCaixaAno)
  let saldo = p.initial
  return linhas.map((l) => {
    saldo = saldo * (1 + taxa) + l.aporteMensal + l.aporteAnual
    saldo -= Math.min(l.retirada, saldo)
    return saldo
  })
}

/** Meses que o caixa do mês paga as obrigações do mês sem NENHUM aluguel, aporte ou retirada. */
export const folego = (l: MonthRow): number => (l.obrigacoesMes > 0 ? Math.max(0, l.saldo) / l.obrigacoesMes : Infinity)

/** Quanto das obrigações o fluxo recorrente cobre: (renda líquida dos aluguéis + aporte mensal) / obrigações. */
export const coberturaObrigacoes = (l: MonthRow): number =>
  l.obrigacoesMes > 0 ? (l.rendaMensalLiquida + l.aporteMensal) / l.obrigacoesMes : Infinity

export type Estresse = {
  piorFolego: { meses: number; mes: number } | null
  piorCobertura: { razao: number; mes: number } | null
  picoObrigacoes: { valor: number; mes: number } | null
}

/**
 * Só vale depois da primeira compra de verdade (no primeiro mês o caixa ainda é zero e qualquer
 * conta fixa parece uma crise). Considera apenas meses com obrigação.
 */
export function estresse(linhas: MonthRow[]): Estresse {
  const inicio = Math.max(0, linhas.findIndex((l) => l.comprasImoveis > 0))
  let piorFolego: Estresse['piorFolego'] = null
  let piorCobertura: Estresse['piorCobertura'] = null
  let pico: Estresse['picoObrigacoes'] = null
  for (let i = inicio; i < linhas.length; i++) {
    const l = linhas[i]
    if (l.obrigacoesMes <= 0) continue
    const f = folego(l)
    if (!piorFolego || f < piorFolego.meses) piorFolego = { meses: f, mes: l.mes }
    const c = coberturaObrigacoes(l)
    if (!piorCobertura || c < piorCobertura.razao) piorCobertura = { razao: c, mes: l.mes }
    if (!pico || l.obrigacoesMes > pico.valor) pico = { valor: l.obrigacoesMes, mes: l.mes }
  }
  return { piorFolego, piorCobertura, picoObrigacoes: pico }
}
