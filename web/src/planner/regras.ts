import { contaDoAluguel } from './calc'
import { inicioDeHoje } from './calendario'
import { comparaLocacao } from './temporada'
import type { PlannerParams } from './types'

/**
 * As regras que não são escolha do usuário: o sistema decide, para acumular o máximo de bens. A tela mostra poucos
 * campos; o motor recebe os parâmetros já resolvidos por aqui (campos antigos de um plano salvo são ignorados).
 *
 * - Aporte anual: salários CLT × salário bruto do casal (o 13º, o bônus e a PLR são "salários").
 * - Acumula por TODO o prazo e vive de aluguel no fim: a transição é o último ano. Sem meta de renda.
 * - Obra corrigida pelo INCC; o resíduo pago à construtora depois das chaves, pelo IPCA.
 * - Parcelado, sobra do caixa e reserva (3 meses) automáticos. IPTU e condomínio sempre do inquilino.
 * - Diária do Airbnb em % do valor do imóvel.
 * - Temporada: tudo ou nada, o que render mais líquido por studio (o rendimento é linear no número de studios).
 * - Consórcio: o sistema escolhe as cotas (`caminhos`); o lance nunca fica abaixo do mínimo do mercado.
 */
export const RESERVA_AUTOMATICA_MESES = 3
export const LANCE_MINIMO_PCT = 40

export function aplicarRegras(p: PlannerParams, ano: number = inicioDeHoje().ano): PlannerParams {
  const base: PlannerParams = {
    ...p,
    annualAmount: Math.round(p.annualSalarios * p.salarioBrutoCasal),
    anoTransicao: p.years,
    aposTransicao: 'vive_da_renda',
    metaRendaHoje: 0,
    correcaoObraModo: 'incc',
    correcaoPosChavesAno: p.ipca,
    parcelamento: 'automatico',
    sobraDoCaixa: 'automatico',
    reservaMeses: RESERVA_AUTOMATICA_MESES,
    iptuPagador: 'inquilino',
    condominioPagador: 'inquilino',
    diariaHoje: (p.diariaPct / 100) * p.custoStudio,
    consorcioCotas: 0,
    consorcioLancePct: Math.max(LANCE_MINIMO_PCT, p.consorcioLancePct),
  }
  const c = comparaLocacao(base, (v) => contaDoAluguel(v, base, ano))
  return { ...base, pctTemporada: c.temporada.liquido > c.longa.liquido ? 100 : 0 }
}
