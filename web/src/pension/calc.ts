/**
 * Motor puro do simulador "Previdência Privada" — plano corporativo: o empregado
 * contribui um % do salário (básico, com contrapartida da empresa por faixa de
 * idade, + extra/facultativo, sem contrapartida), tudo cai num fundo de
 * PGBL/VGBL de verdade, com IR no resgate (ver `estimarImposto`). Sem FGTS, sem
 * apê — isso é do simulador de imóveis, não tem nada a ver com previdência. Sem
 * rede, sem Firestore; só matemática, testada em calc.test.ts.
 *
 * Cada aporte do mês (básico + extra + contrapartida da empresa + restituição,
 * quando cai) vira uma TRANCHE própria, com o próprio mês de entrada: é o que a
 * tabela regressiva exige (a alíquota de cada real depende de HÁ QUANTO TEMPO
 * ele entrou, não de quando o fundo como um todo começou). Como o rendimento
 * líquido mensal é constante ao longo da simulação, somar o valor composto de
 * cada tranche dá exatamente o mesmo saldo bruto que compor um saldo único mês
 * a mês — por isso dá para ter as duas contas (saldo bruto simples e imposto
 * por tranche) sem duas fontes de verdade.
 */
import type { FaixaEmpresa, PensionMonthRow, PensionParams, PensionYearPoint, Regime, Vehicle } from './types'

//: regras do produto, não escolha pessoal.
const TETO_DEDUCAO_PGBL_PCT = 12 // % da renda bruta anual, limite de dedução do PGBL
const MES_RESTITUICAO_IR = 5 // maio — quando a restituição do ano anterior cai na conta

type Tranche = { mes: number; valor: number }

function taxaMensal(pctAnual: number): number {
  return Math.pow(1 + pctAnual / 100, 1 / 12) - 1
}

/** Mês do ano (1=jan … 12=dez) do mês-índice da simulação (1, 2, 3… desde o início). */
function mesDoAno(mes: number): number {
  return ((mes - 1) % 12) + 1
}

/** Idade (anos completos) no mês-índice `mes` — só sobe em blocos de 12, nunca fracionada:
 * é assim que uma faixa "até 40 anos" é lida de verdade. */
function idadeNoMes(idadeAtual: number, mes: number): number {
  return idadeAtual + Math.floor((mes - 1) / 12)
}

/** A faixa que cobre `idade`, ou 0% se nenhuma cobrir — sem faixa cadastrada pra essa
 * idade, a empresa simplesmente não contribui naquele mês (não é erro, é silêncio). */
function percentualDaFaixa(faixas: FaixaEmpresa[], idade: number): number {
  const faixa = faixas.find((f) => idade >= f.idadeMin && idade <= f.idadeMax)
  return faixa ? faixa.percentual : 0
}

/**
 * Tabela regressiva do IR sobre previdência — definitiva, por tranche: quanto
 * mais velho o aporte, menor a alíquota. Nunca sobe de novo depois de passar
 * dos 10 anos (fica em 10% para sempre).
 */
function aliquotaRegressiva(mesesDeIdade: number): number {
  const anos = mesesDeIdade / 12
  if (anos <= 2) return 35
  if (anos <= 4) return 30
  if (anos <= 6) return 25
  if (anos <= 8) return 20
  if (anos <= 10) return 15
  return 10
}

/**
 * Saldo bruto, saldo líquido estimado (se resgatasse tudo agora) e a alíquota
 * média ponderada, a partir das tranches até `mes`.
 *
 * PGBL: a base tributável de cada tranche é o valor CHEIO hoje — o aporte foi
 * deduzido na declaração, então todo o resgate é renda tributável (assume que
 * o aporte ficou dentro do teto de 12%; simplificação documentada no README do
 * simulador). VGBL: a base é só o GANHO de cada tranche.
 *
 * Regressiva: cada tranche paga a PRÓPRIA alíquota pela idade dela (definitiva).
 * Progressiva: toda base tributável entra pela alíquota marginal informada —
 * simplificação da tabela do IR (a regra real retém 15% na fonte e ajusta na
 * declaração anual somando com o resto da renda da pessoa, que este simulador
 * não conhece). A contrapartida da empresa entra como qualquer outra tranche:
 * este simulador não separa um regime fiscal próprio pra ela.
 */
function resumoNoMes(
  tranches: Tranche[], mes: number, taxaMensalLiquida: number,
  vehicle: Vehicle, regime: Regime, aliquotaIrMarginal: number,
): { saldoBruto: number; saldoLiquido: number; aliquotaMedia: number } {
  let saldoBruto = 0
  let baseTotal = 0
  let impostoTotal = 0
  for (const t of tranches) {
    const valorHoje = t.valor * Math.pow(1 + taxaMensalLiquida, mes - t.mes)
    saldoBruto += valorHoje
    const ganhoHoje = valorHoje - t.valor
    const base = vehicle === 'PGBL' ? valorHoje : Math.max(0, ganhoHoje)
    const aliquota = regime === 'regressiva' ? aliquotaRegressiva(mes - t.mes) : aliquotaIrMarginal
    impostoTotal += base * (aliquota / 100)
    baseTotal += base
  }
  return {
    saldoBruto,
    saldoLiquido: saldoBruto - impostoTotal,
    aliquotaMedia: baseTotal > 0 ? (impostoTotal / baseTotal) * 100 : 0,
  }
}

export function simulateMonthly(p: PensionParams): PensionMonthRow[] {
  const meses = Math.round(p.years * 12)
  const taxaMensalLiquida = taxaMensal(p.rendimentoAnual - p.taxaAdministracaoAnual)

  const tranches: Tranche[] = []
  if (p.initial > 0) tranches.push({ mes: 0, valor: p.initial })

  let salario = p.salarioBruto

  // Acumulado de aportes PRÓPRIOS (básico + extra, nunca a contrapartida da
  // empresa) do ano civil corrente — zera em janeiro — base da dedução de 12%
  // da renda bruta anual; a restituição cai em maio do ano seguinte.
  let aportesPgblDoAno = 0
  let restituicaoPendente = 0

  let saldoBrutoAnterior = p.initial
  const linhas: PensionMonthRow[] = []

  for (let mes = 1; mes <= meses; mes++) {
    if (mesDoAno(mes) === p.mesDissidio) salario *= 1 + p.dissidio / 100

    const idade = idadeNoMes(p.idadeAtual, mes)
    const aporteBasicoDoMes = salario * (p.aporteBasicoPct / 100)
    const aporteExtraDoMes = salario * (p.aporteExtraPct / 100)
    const aporteEmpresaDoMes = aporteBasicoDoMes * (percentualDaFaixa(p.faixasEmpresa, idade) / 100)

    // Restituição de IR do PGBL: pedida em maio, sobre a dedução do ano anterior
    // — reinvestida automaticamente no mesmo fundo, igual a qualquer outro aporte.
    let restituicaoDoMes = 0
    if (p.vehicle === 'PGBL' && mesDoAno(mes) === MES_RESTITUICAO_IR) {
      restituicaoDoMes = restituicaoPendente
      restituicaoPendente = 0
    }

    const totalAportadoDoMes = aporteBasicoDoMes + aporteExtraDoMes + aporteEmpresaDoMes + restituicaoDoMes
    if (totalAportadoDoMes > 0) tranches.push({ mes, valor: totalAportadoDoMes })
    if (p.vehicle === 'PGBL') aportesPgblDoAno += aporteBasicoDoMes + aporteExtraDoMes

    // Fecha o ano civil em dezembro: dedução limitada a 12% da renda bruta anual
    // (aproximada pelo salário do mês × 12), restituição guardada para maio.
    if (p.vehicle === 'PGBL' && mesDoAno(mes) === 12) {
      const rendaBrutaAnual = salario * 12
      const deducao = Math.min(aportesPgblDoAno, rendaBrutaAnual * (TETO_DEDUCAO_PGBL_PCT / 100))
      restituicaoPendente = deducao * (p.aliquotaIrMarginal / 100)
      aportesPgblDoAno = 0
    }

    const resumo = resumoNoMes(tranches, mes, taxaMensalLiquida, p.vehicle, p.regime, p.aliquotaIrMarginal)
    const rendimentoDoMes = resumo.saldoBruto - saldoBrutoAnterior - totalAportadoDoMes
    saldoBrutoAnterior = resumo.saldoBruto

    linhas.push({
      mes,
      anoDoPlano: Math.ceil(mes / 12),
      mesDoAno: mesDoAno(mes),
      idade,
      aporteBasico: Math.round(aporteBasicoDoMes),
      aporteExtra: Math.round(aporteExtraDoMes),
      aporteEmpresa: Math.round(aporteEmpresaDoMes),
      restituicaoPgbl: Math.round(restituicaoDoMes),
      saldoBruto: Math.round(resumo.saldoBruto),
      saldoLiquidoEstimado: Math.round(resumo.saldoLiquido),
      rendimentoDoMes: Math.round(rendimentoDoMes),
      aliquotaMedia: Math.round(resumo.aliquotaMedia * 10) / 10,
    })
  }

  return linhas
}

export function simulate(p: PensionParams): PensionYearPoint[] {
  const linhas = simulateMonthly(p)
  const taxaMensalLiquida = taxaMensal(p.rendimentoAnual - p.taxaAdministracaoAnual)
  const pontos: PensionYearPoint[] = [{
    ano: 0,
    idade: p.idadeAtual,
    saldoBruto: Math.round(p.initial),
    saldoLiquidoEstimado: Math.round(p.initial), // sem ganhos ainda, nada a tributar
    aliquotaMedia: 0,
    rendaMensalEstimada: 0,
  }]
  for (const linha of linhas) {
    if (linha.mes % 12 !== 0) continue
    pontos.push({
      ano: linha.mes / 12,
      idade: linha.idade,
      saldoBruto: linha.saldoBruto,
      saldoLiquidoEstimado: linha.saldoLiquidoEstimado,
      aliquotaMedia: linha.aliquotaMedia,
      rendaMensalEstimada: Math.round(linha.saldoLiquidoEstimado * taxaMensalLiquida),
    })
  }
  return pontos
}
