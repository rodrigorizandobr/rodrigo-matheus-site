/**
 * A prévia do "Vivendo de imóveis" na home usa o MOTOR REAL do simulador, não uma conta à parte:
 * número de vitrine que não bate com a ferramenta é propaganda enganosa. O cenário é o mais simples
 * que o motor aceita — só um aporte mensal, sem bônus, sem FGTS, sem apê financiado e sem studio em
 * andamento — com todo o resto nos padrões de mercado e nas regras automáticas do simulador.
 * Custa ~100 ms por rodada e puxa o motor inteiro: a home importa este arquivo sob demanda.
 */
import { simulateMonthly } from '../planner/calc'
import { emReaisDeHoje } from '../planner/inflacao'
import { aplicarRegras } from '../planner/regras'
import { DEFAULT_PARAMS } from '../planner/types'

export type Previa = {
  /** patrimônio em reais de hoje, do começo (ano 0) ao fim do prazo */
  pontos: { ano: number; patrimonio: number }[]
  patrimonio: number
  imoveis: number
  /** renda mensal disponível no fim do prazo, em reais de hoje */
  renda: number
}

export function previa(aporteMensal: number, anos: number, fatias = 4): Previa {
  const p = aplicarRegras({
    ...DEFAULT_PARAMS,
    monthlyAmount: aporteMensal, years: anos,
    annualSalarios: 0, salarioBrutoCasal: 0, dividaApe: 0, parcelaApeAtual: 0,
    initial: 0, parcelaMensal1o: 0, parcelaAnual1o: 0,
  })
  const linhas = simulateMonthly(p)
  const hoje = (valor: number, mes: number) => Math.max(0, Math.round(emReaisDeHoje(valor, mes, p.ipca)))
  const pontos = [{ ano: 0, patrimonio: 0 }]
  for (let i = 1; i <= fatias; i++) {
    const l = linhas[Math.max(0, Math.round((linhas.length * i) / fatias) - 1)]
    pontos.push({ ano: (anos * i) / fatias, patrimonio: l ? hoje(l.patrimonioLiquido, l.mes) : 0 })
  }
  const fim = linhas[linhas.length - 1]
  return {
    pontos,
    patrimonio: pontos[fatias].patrimonio,
    imoveis: fim?.totalImoveis ?? 0,
    renda: fim ? hoje(fim.rendaDisponivel, fim.mes) : 0,
  }
}
