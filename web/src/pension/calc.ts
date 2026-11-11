/**
 * Motor puro do simulador "Previdência Privada" — irmão do "Vivendo de Imóveis"
 * (mesmo salário CLT + FGTS amortizando o apê, ver `calc.ts` de lá), só que o
 * destino do aporte é um fundo de PGBL/VGBL de verdade: sem come-cotas semestral,
 * com a dedução de 12% da renda bruta anual (só PGBL) e a tabela de IR do regime
 * escolhido no resgate (ver `estimarImposto`). Sem rede, sem Firestore; só
 * matemática, testada em calc.test.ts.
 *
 * Diferente do simulador de imóveis (unidades discretas), aqui o dinheiro é um
 * fundo só — mas cada aporte (mensal, anual, sobra do FGTS, restituição do PGBL)
 * vira uma TRANCHE própria, com o próprio mês de entrada: é o que a tabela
 * regressiva exige (a alíquota de cada real depende de HÁ QUANTO TEMPO ele entrou,
 * não de quando o fundo como um todo começou). Como o rendimento líquido mensal é
 * constante ao longo da simulação, somar o valor composto de cada tranche dá
 * exatamente o mesmo saldo bruto que compor um saldo único mês a mês — por isso
 * dá para ter as duas contas (saldo bruto simples E imposto por tranche) sem
 * duas fontes de verdade.
 *
 * FGTS, dissídio e abatimento do apê são cópia do motor de imóveis: a única
 * mudança é o que a QUEDA da parcela e a SOBRA do saque compram — lá comprava
 * studio à vista, aqui não existe "studio", então a sobra inteira vira mais uma
 * tranche no fundo de previdência.
 */
import type { PensionMonthRow, PensionParams, PensionYearPoint, Regime, Vehicle } from './types'

//: FGTS — regra do fundo, não escolha do autor do plano: por isso não é slider do formulário.
const FGTS_DEPOSITO_PCT = 8 // % do salário bruto, depósito patronal mensal
const FGTS_RENDIMENTO_ANUAL = 5.5 // % a.a. (TR + juros + distribuição de lucros)
const MES_DO_13O = 12 // o 13º salário também gera depósito de FGTS
const MESES_POR_SAQUE_FGTS = 24 // saque para amortizar financiamento imobiliário: a cada 2 anos

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
 * deduzido na declaração, então todo o resgate é renda tributável (assume que o
 * aporte ficou dentro do teto de 12%; o que passar disso não deveria ser
 * tributado nesta base, mas simular o excedente exigiria separar dois saldos
 * dentro do mesmo fundo — simplificação aceita aqui).
 * VGBL: a base é só o GANHO de cada tranche — o aporte já saiu de renda
 * tributada, então só o rendimento é tributado no resgate.
 *
 * Regressiva: cada tranche paga a PRÓPRIA alíquota pela idade dela (definitiva).
 * Progressiva: toda base tributável entra pela alíquota marginal informada —
 * simplificação da tabela do IR: a regra real retém 15% na fonte e ajusta na
 * declaração anual somando com o resto da renda da pessoa, que este simulador
 * não conhece.
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
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)

  const tranches: Tranche[] = []
  if (p.initial > 0) tranches.push({ mes: 0, valor: p.initial })

  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let salario = p.salarioBrutoCasal
  let parcelaApe = p.parcelaApeAtual
  let saldoApe = p.dividaApe
  let fgtsSaldo = 0
  let extraDoApe = 0

  // Acumulado de aportes PGBL do ano civil corrente (zera em janeiro) — base da
  // dedução de 12% da renda bruta anual; a restituição cai em maio do ano seguinte.
  let aportesPgblDoAno = 0
  let restituicaoPendente = 0

  let saldoBrutoAnterior = p.initial
  const linhas: PensionMonthRow[] = []

  for (let mes = 1; mes <= meses; mes++) {
    if (mesDoAno(mes) === p.mesDissidio) {
      aporteMensal *= 1 + p.dissidio / 100
      aporteAnual *= 1 + p.dissidio / 100
      salario *= 1 + p.dissidio / 100
    }

    // FGTS: rende todo mês e recebe o depósito patronal — o do 13º soma em dezembro.
    fgtsSaldo *= 1 + fgtsRendimentoMensal
    fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)
    if (mesDoAno(mes) === MES_DO_13O) fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)

    // A cada 2 anos, o FGTS acumulado abate o saldo do apê primeiro; a parcela cai
    // na mesma proporção do saldo (prazo mantido), e a queda vira aporte mensal
    // dali em diante. A sobra do saque (apê já quitado, ou saque maior que o
    // saldo) não compra nada — vira direto mais uma tranche na previdência.
    let abatimentoApeDoMes = 0
    let aporteFgtsExtraDoMes = 0
    if (mes % MESES_POR_SAQUE_FGTS === 0) {
      if (saldoApe > 0) {
        const abatimento = Math.min(fgtsSaldo, saldoApe)
        if (abatimento > 0) {
          const saldoNovo = saldoApe - abatimento
          const parcelaNova = parcelaApe * (saldoNovo / saldoApe)
          extraDoApe += parcelaApe - parcelaNova
          parcelaApe = parcelaNova
          saldoApe = saldoNovo
          fgtsSaldo -= abatimento
          abatimentoApeDoMes = abatimento
        }
      }
      if (fgtsSaldo > 0) {
        aporteFgtsExtraDoMes = fgtsSaldo
        fgtsSaldo = 0
      }
    }

    // Restituição de IR do PGBL: pedida em maio, sobre a dedução do ano anterior
    // — reinvestida automaticamente no mesmo fundo, igual à sobra do FGTS.
    let restituicaoDoMes = 0
    if (p.vehicle === 'PGBL' && mesDoAno(mes) === MES_RESTITUICAO_IR) {
      restituicaoDoMes = restituicaoPendente
      restituicaoPendente = 0
    }

    const aporteDoMes = aporteMensal + extraDoApe
    const aporteAnualDoMes = mesDoAno(mes) === p.annualMonth ? aporteAnual : 0

    const totalAportadoDoMes = aporteDoMes + aporteAnualDoMes + aporteFgtsExtraDoMes + restituicaoDoMes
    if (totalAportadoDoMes > 0) tranches.push({ mes, valor: totalAportadoDoMes })
    if (p.vehicle === 'PGBL') aportesPgblDoAno += aporteDoMes + aporteAnualDoMes + aporteFgtsExtraDoMes

    // Fecha o ano civil em dezembro: dedução limitada a 12% da renda bruta anual
    // (aproximada pelo salário do mês × 12), restituição guardada para maio.
    if (p.vehicle === 'PGBL' && mesDoAno(mes) === MES_DO_13O) {
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
      aporteMensal: Math.round(aporteDoMes),
      aporteAnual: Math.round(aporteAnualDoMes),
      restituicaoPgbl: Math.round(restituicaoDoMes),
      abatimentoApeFgts: Math.round(abatimentoApeDoMes),
      aporteFgtsExtra: Math.round(aporteFgtsExtraDoMes),
      saldoFgts: Math.round(fgtsSaldo),
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
    saldoBruto: Math.round(p.initial),
    saldoLiquidoEstimado: Math.round(p.initial), // sem ganhos ainda, nada a tributar
    aliquotaMedia: 0,
    rendaMensalEstimada: 0,
  }]
  for (const linha of linhas) {
    if (linha.mes % 12 !== 0) continue
    pontos.push({
      ano: linha.mes / 12,
      saldoBruto: linha.saldoBruto,
      saldoLiquidoEstimado: linha.saldoLiquidoEstimado,
      aliquotaMedia: linha.aliquotaMedia,
      rendaMensalEstimada: Math.round(linha.saldoLiquidoEstimado * taxaMensalLiquida),
    })
  }
  return pontos
}
