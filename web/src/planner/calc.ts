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
 * Dissídio (sempre em agosto) reajusta o aporte mensal E o aporte anual ANTES do
 * aporte daquele mês — o salário já sobe aquele mês. O aporte anual (o bônus) cai
 * de uma vez só no mês escolhido (`annualMonth`), não espalhado pelo ano — por
 * isso rende mais patrimônio no fim quanto mais cedo no ano ele cai, já que tem
 * mais meses pela frente para compor. O abatimento do apê, a cada 3 anos, só eleva
 * o aporte mensal a partir do mês SEGUINTE ao ciclo: primeiro o dinheiro paga a
 * amortização, depois é que sobra para os studios. Os três param de contar no ano
 * de transição, quando os aportes do bolso caem para R$0 e a carteira passa a
 * crescer só com os próprios aluguéis reinvestidos.
 */
import type { PlannerParams, YearPoint } from './types'

const MESES_POR_CICLO_APE = 36
const MES_DO_DISSIDIO = 8 // agosto, contando janeiro = mês 1 do ano
const PCT_PAGO_CHAVES_MINIMO = 10

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

  let patrimonio = p.initial
  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let extraDoApe = 0
  let abatidoAcumulado = 0

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
    if (!transicionou && mesDoAno(mes) === MES_DO_DISSIDIO) {
      aporteMensal *= 1 + p.dissidio / 100
      aporteAnual *= 1 + p.dissidio / 100
    }

    let aporteDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (mesDoAno(mes) === p.annualMonth) aporteDoMes += aporteAnual
    }
    patrimonio = patrimonio * (1 + retornoEquityMensal) + aporteDoMes

    if (mes % MESES_POR_CICLO_APE === 0) {
      const novoAbatido = Math.min(abatidoAcumulado + p.abate3anos, p.dividaApe)
      const abatidoNoCiclo = novoAbatido - abatidoAcumulado
      abatidoAcumulado = novoAbatido
      if (abatidoNoCiclo > 0) extraDoApe += (abatidoNoCiclo / 100_000) * p.extra100k
    }

    if (mes % 12 === 0) registra(mes)
  }

  return pontos
}
