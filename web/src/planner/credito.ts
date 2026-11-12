/**
 * Uma parcela em SAC com correção monetária do saldo. `jurosMes` e `correcaoMes` em fração
 * (0,01 = 1%). No plano investidor os juros são zero e a correção é o índice da obra.
 */
export function parcelaSac(saldo: number, mesesRestantes: number, jurosMes: number, correcaoMes: number):
  { parcela: number; amortizacao: number; juros: number; saldoDepois: number } {
  const corrigido = saldo * (1 + correcaoMes)
  const ultima = mesesRestantes <= 1
  const amortizacao = ultima ? corrigido : corrigido / mesesRestantes
  const juros = corrigido * jurosMes
  return { parcela: amortizacao + juros, amortizacao, juros, saldoDepois: ultima ? 0 : corrigido - amortizacao }
}

/** Custo efetivo anual de uma linha: juros ao mês compostos + correção. Em %. */
export const custoAnualDoCredito = (jurosMesPct: number, correcaoAnoPct: number): number =>
  (Math.pow(1 + jurosMesPct / 100, 12) * (1 + correcaoAnoPct / 100) - 1) * 100
