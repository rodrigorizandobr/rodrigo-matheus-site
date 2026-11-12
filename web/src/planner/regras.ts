import type { PlannerParams } from './types'

/**
 * As regras que não são escolha do usuário. A tela mostra poucos campos; o resto do motor recebe
 * os parâmetros já resolvidos por aqui (e os campos antigos, se existirem num plano salvo, são ignorados).
 *
 * - Aporte anual: salários CLT × salário bruto do casal (o 13º, o bônus e a PLR são "salários").
 * - Acumula por TODO o prazo e vive de aluguel no fim: a transição é o último ano. Quer continuar comprando? Aumente o prazo.
 * - Obra corrigida pelo INCC; o resíduo pago à construtora depois das chaves, pelo IPCA.
 * - Parcelado, sobra do caixa e reserva automáticos (reserva de 3 meses de obrigações).
 * - IPTU e condomínio sempre do inquilino.
 */
export const RESERVA_AUTOMATICA_MESES = 3

export function aplicarRegras(p: PlannerParams): PlannerParams {
  return {
    ...p,
    annualAmount: Math.round(p.annualSalarios * p.salarioBrutoCasal),
    anoTransicao: p.years,
    aposTransicao: 'vive_da_renda',
    correcaoObraModo: 'incc',
    correcaoPosChavesAno: p.ipca,
    parcelamento: 'automatico',
    sobraDoCaixa: 'automatico',
    reservaMeses: RESERVA_AUTOMATICA_MESES,
    iptuPagador: 'inquilino',
    condominioPagador: 'inquilino',
  }
}
