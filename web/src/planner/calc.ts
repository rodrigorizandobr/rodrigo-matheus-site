/**
 * Motor puro do simulador "Vivendo de Imóveis" — uma estratégia: comprar direto na
 * holding, financiando o saldo remanescente nas chaves (ver types.ts). Sem rede,
 * sem Firestore; só matemática, testada em calc.test.ts.
 *
 * Passo mensal, registrado ano a ano. O retorno mensal do patrimônio já investido é
 * o aluguel líquido (rate, líquido do imposto da holding) mais a valorização líquida
 * dos studios já comprados (incc menos a depreciação por idade/INCC de obra),
 * alavancado pelo financiamento da fatia não paga nas chaves (1 - pctPagoChaves):
 * um real de capital próprio controla 1/pctPagoChaves reais de studio, e a fatia
 * financiada custa jurosFinHolding ao mês — fórmula padrão de retorno alavancado
 * (R_equity = R_ativo / LTV_investido - (1/LTV_investido - 1) × custo_da_dívida).
 *
 * Dissídio (no mês escolhido, `mesDissidio`) reajusta o aporte mensal, o aporte
 * anual E o salário bruto ANTES do aporte daquele mês — o salário já sobe aquele
 * mês, e o FGTS (que depende do salário) sobe junto. O aporte anual (o bônus) cai
 * de uma vez só no mês escolhido (`annualMonth`), não espalhado pelo ano — por
 * isso rende mais patrimônio no fim quanto mais cedo no ano ele cai, já que tem
 * mais meses pela frente para compor.
 *
 * O FGTS do casal (8% do salário bruto, com depósito extra do 13º em dezembro,
 * rendendo a taxa legal do fundo) é calculado por dentro, não é um parâmetro do
 * formulário. A cada 2 anos (prazo mínimo legal para saque-amortização), ele abate
 * o saldo devedor do apê. Como o banco recalcula a parcela mantendo o PRAZO (e não
 * o prazo mantendo a parcela), a parcela cai na mesma proporção do saldo — e essa
 * QUEDA, a partir do mês seguinte, vira aporte mensal extra nos studios: é dinheiro
 * que já saía do orçamento da família e deixou de ser preciso para o apê.
 *
 * Todos esses efeitos param de contar no ano de transição, quando os aportes do
 * bolso caem para R$0 e a carteira passa a crescer só com os próprios aluguéis
 * reinvestidos — mas o FGTS e a queda de parcela continuam computados por baixo
 * (só não entram mais no aporte, porque não há mais aporte).
 */
import type { PlannerParams, YearPoint } from './types'

const PCT_PAGO_CHAVES_MINIMO = 10

//: FGTS — regra do fundo, não escolha do autor do plano: por isso não é slider do formulário.
const FGTS_DEPOSITO_PCT = 8 // % do salário bruto, depósito patronal mensal
const FGTS_RENDIMENTO_ANUAL = 5.5 // % a.a. (TR + juros + distribuição de lucros)
const MES_DO_13O = 12 // o 13º salário também gera depósito de FGTS
const MESES_POR_SAQUE_FGTS = 24 // saque para amortizar financiamento imobiliário: a cada 2 anos

function taxaMensal(pctAnual: number): number {
  return Math.pow(1 + pctAnual / 100, 1 / 12) - 1
}

/** Mês do ano (1=jan … 12=dez) do mês-índice da simulação (1, 2, 3… desde o início). */
function mesDoAno(mes: number): number {
  return ((mes - 1) % 12) + 1
}

export function simulate(p: PlannerParams): YearPoint[] {
  const meses = Math.round(p.years * 12)
  const pctChaves = Math.max(PCT_PAGO_CHAVES_MINIMO, p.pctPagoChaves) / 100
  const alavancagem = 1 / pctChaves

  const aluguelLiquidoMensal = (p.rate / 100) * (1 - p.impostoHolding / 100)
  const valorizacaoLiquidaMensal = taxaMensal(p.incc - p.depreciacao)
  const retornoAtivoMensal = aluguelLiquidoMensal + valorizacaoLiquidaMensal
  const custoDividaMensal = p.jurosFinHolding / 100
  const retornoEquityMensal = alavancagem * retornoAtivoMensal - (alavancagem - 1) * custoDividaMensal
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)

  let patrimonio = p.initial
  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let salario = p.salarioBrutoCasal
  let parcelaApe = p.parcelaApeAtual
  let saldoApe = p.dividaApe
  let fgtsSaldo = 0
  let extraDoApe = 0

  const pontos: YearPoint[] = []
  const registra = (mesFim: number) => {
    const ano = mesFim / 12
    const precoStudioNovo = p.custoStudio * Math.pow(1 + p.incc / 100, ano)
    const studiosComChaves = Math.floor(patrimonio / (precoStudioNovo * pctChaves))
    const studiosQuitadosEquiv = Math.floor(patrimonio / precoStudioNovo)
    const rendaMensalLiquida = studiosQuitadosEquiv * precoStudioNovo * aluguelLiquidoMensal
    pontos.push({
      ano,
      patrimonioLiquido: Math.round(patrimonio),
      precoStudioNovo: Math.round(precoStudioNovo),
      studiosComChaves,
      studiosQuitadosEquiv,
      rendaMensalLiquida: Math.round(rendaMensalLiquida),
    })
  }
  registra(0)

  for (let mes = 1; mes <= meses; mes++) {
    const transicionou = mes > p.anoTransicao * 12
    if (!transicionou && mesDoAno(mes) === p.mesDissidio) {
      aporteMensal *= 1 + p.dissidio / 100
      aporteAnual *= 1 + p.dissidio / 100
      salario *= 1 + p.dissidio / 100
    }

    // FGTS: rende todo mês e recebe o depósito patronal — o do 13º soma em dezembro.
    fgtsSaldo *= 1 + fgtsRendimentoMensal
    fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)
    if (mesDoAno(mes) === MES_DO_13O) fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)

    // A cada 2 anos, o FGTS acumulado abate o saldo do apê; a parcela cai na mesma
    // proporção do saldo (prazo mantido), e a queda vira aporte mensal dali em diante.
    if (mes % MESES_POR_SAQUE_FGTS === 0 && saldoApe > 0) {
      const abatimento = Math.min(fgtsSaldo, saldoApe)
      if (abatimento > 0) {
        const saldoNovo = saldoApe - abatimento
        const parcelaNova = parcelaApe * (saldoNovo / saldoApe)
        extraDoApe += parcelaApe - parcelaNova
        parcelaApe = parcelaNova
        saldoApe = saldoNovo
        fgtsSaldo -= abatimento
      }
    }

    let aporteDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (mesDoAno(mes) === p.annualMonth) aporteDoMes += aporteAnual
    }
    patrimonio = patrimonio * (1 + retornoEquityMensal) + aporteDoMes

    if (mes % 12 === 0) registra(mes)
  }

  return pontos
}
