import { simulateMonthly } from './calc'
import type { Inicio } from './calendario'
import { emReaisDeHoje } from './inflacao'
import { estresse, mesDaMeta } from './indicadores'
import type { PlannerParams } from './types'

export type Estrategia = { id: string; nome: string; descricao: string; params: PlannerParams }
export type Resultado = {
  id: string
  nome: string
  descricao: string
  studios: number
  patrimonioFinal: number
  patrimonioFinalHoje: number
  rendaDisponivelFinal: number
  rendaDisponivelFinalHoje: number
  picoDivida: number
  menorSaldo: number
  piorFolegoMeses: number | null
  mesDaMeta: number | null
}

/** Reescala as quatro fatias "até as chaves" do contrato para somarem `total` (resto vai para depois das chaves). */
export function escalarContrato(p: PlannerParams, total: number): PlannerParams {
  const soma = p.entradaPct + p.mensaisPct + p.reforcoPct + p.chavesPct
  if (soma <= 0) return p
  const f = total / soma
  const entradaPct = Math.round(p.entradaPct * f)
  const mensaisPct = Math.round(p.mensaisPct * f)
  const reforcoPct = Math.round(p.reforcoPct * f)
  return { ...p, entradaPct, mensaisPct, reforcoPct, chavesPct: Math.max(0, total - entradaPct - mensaisPct - reforcoPct) }
}

const igual = (a: PlannerParams, b: PlannerParams) => JSON.stringify(a) === JSON.stringify(b)

/** O plano da pessoa e algumas variações fixas, uma coisa de cada vez. */
export function estrategias(p: PlannerParams): Estrategia[] {
  const lista: Estrategia[] = [{ id: 'plano', nome: 'Seu plano', descricao: 'Como está nos campos ao lado.', params: p }]
  const variacoes: Estrategia[] = [
    { id: 'sem_divida', nome: 'Pagando tudo até as chaves', descricao: 'Sem parcelar nada depois da entrega; nenhuma dívida nova.', params: escalarContrato(p, 100) },
    { id: 'alavancado', nome: 'Metade parcelada depois das chaves', descricao: 'Só 50% do preço até as chaves; o resto parcelado sem juros.', params: escalarContrato(p, 50) },
    {
      id: 'temporada',
      nome: p.pctTemporada >= 50 ? 'Tudo em aluguel tradicional' : 'Tudo em temporada',
      descricao: 'A carteira inteira no outro modo de locação.',
      params: { ...p, pctTemporada: p.pctTemporada >= 50 ? 0 : 100 },
    },
    {
      id: 'consorcio',
      nome: p.consorcioCotas > 0 ? 'Sem consórcio' : 'Com 2 cotas de consórcio',
      descricao: p.consorcioCotas > 0 ? 'Sem as cotas.' : 'Duas cartas de crédito começando hoje.',
      params: { ...p, consorcioCotas: p.consorcioCotas > 0 ? 0 : 2 },
    },
  ]
  if (p.agioProntoPct > 0) {
    variacoes.push({
      id: 'chaves',
      nome: p.pctVendaNasChaves >= 50 ? 'Sem vender nas chaves' : 'Vendendo tudo nas chaves',
      descricao: 'Vende cada studio da planta na entrega e recompra.',
      params: { ...p, pctVendaNasChaves: p.pctVendaNasChaves >= 50 ? 0 : 100 },
    })
  }
  variacoes.push({
    id: 'ruim',
    nome: 'Cenário ruim',
    descricao: 'Aluguel 15% menor, 1 mês vago a mais por ano, obra 6 meses mais longa e ocupação 10 pontos menor na temporada.',
    params: {
      ...p,
      rate: p.rate * 0.85,
      vacanciaMesesAno: Math.min(12, p.vacanciaMesesAno + 1),
      prazoObraMeses: p.prazoObraMeses + 6,
      mesesEntrega1o: p.mesesEntrega1o + 6,
      ocupacaoPct: Math.max(0, p.ocupacaoPct - 10),
    },
  })
  for (const v of variacoes) if (v.id === 'ruim' || !igual(v.params, p)) lista.push(v)
  return lista
}

export function compararEstrategias(p: PlannerParams, inicio: Inicio): Resultado[] {
  return estrategias(p).map((e) => {
    const linhas = simulateMonthly(e.params, inicio)
    const f = linhas.at(-1)!
    const m = linhas.length
    return {
      id: e.id,
      nome: e.nome,
      descricao: e.descricao,
      studios: f.totalImoveis,
      patrimonioFinal: f.patrimonioLiquido,
      patrimonioFinalHoje: emReaisDeHoje(f.patrimonioLiquido, m, p.ipca),
      rendaDisponivelFinal: f.rendaDisponivel,
      rendaDisponivelFinalHoje: emReaisDeHoje(f.rendaDisponivel, m, p.ipca),
      picoDivida: Math.max(0, ...linhas.map((l) => l.dividaFinanciamento + l.aPagarObra + l.dividaConsorcio)),
      menorSaldo: Math.min(...linhas.map((l) => l.saldo)),
      piorFolegoMeses: estresse(linhas).piorFolego?.meses ?? null,
      mesDaMeta: mesDaMeta(linhas),
    }
  })
}
