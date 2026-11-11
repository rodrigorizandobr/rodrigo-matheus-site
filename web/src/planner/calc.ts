/**
 * Motor puro do simulador "Vivendo de Imóveis" — uma estratégia: comprar direto na
 * holding, financiando o saldo remanescente nas chaves (ver types.ts). Sem rede,
 * sem Firestore; só matemática, testada em calc.test.ts.
 *
 * Diferente de uma versão anterior (que tratava o patrimônio como um bolo só,
 * crescendo a uma taxa alavancada média), aqui cada studio é uma UNIDADE discreta,
 * com o próprio ciclo de vida: em construção → pronto (alugado) → com saldo
 * financiado → quitado. É o que faz existir um diário de bordo mês a mês de
 * verdade (`simulateMonthly`), não uma aproximação contínua.
 *
 * Ciclo de uma unidade:
 * 1. Compra: paga `pctPagoChaves`% na hora (sai do caixa), entra "em construção".
 *    O preço trava no valor do lançamento daquele mês (`custoStudio` corrigido
 *    pelo INCC até ali).
 * 2. Durante a obra (`PRAZO_OBRA_MESES`, fixo — não é escolha de quem simula, é
 *    quanto tempo uma obra leva), a unidade não gera aluguel nem tem dívida
 *    bancária ainda: o equity dela fica PARADO no que já foi pago (o resto é só
 *    uma promessa contratual, não um empréstimo).
 * 3. Na entrega (`mesPronto`): o valor da unidade pula para o preço de lançamento
 *    já corrigido pelo INCC da obra inteira — é a "valorização de entrega de
 *    chaves" que o pré-lançamento garante, capturada de uma vez, não aos poucos.
 *    O saldo não pago (a fatia financiada) começa a amortizar em SAC ao longo de
 *    `PRAZO_FIN_HOLDING_MESES` (fixo, igual à obra), a `jurosFinHolding` ao mês.
 *    A partir daqui ela também aluga: `aluguelLiquidoMensal` sobre o valor atual.
 * 4. Enquanto o saldo financiado não chega a zero, ela é "financiada"; quando
 *    chega, vira "quitada" — mas nunca deixa de alugar.
 *
 * O caixa (aportes do bolso + aluguéis recebidos − parcelas pagas) se acumula até
 * dar pra comprar a próxima unidade (`pctPagoChaves`% do preço do lançamento
 * daquele mês) — não existe mais um "retorno médio alavancado": o retorno emerge
 * sozinho da soma de aluguel, amortização e valorização de cada unidade.
 *
 * Dissídio (no mês escolhido, `mesDissidio`) reajusta o aporte mensal, o aporte
 * anual E o salário bruto ANTES do aporte daquele mês. O aporte anual cai de uma
 * vez só no mês escolhido (`annualMonth`), não espalhado pelo ano.
 *
 * O FGTS do casal (8% do salário bruto, com depósito extra do 13º em dezembro,
 * rendendo a taxa legal do fundo) é calculado por dentro, não é parâmetro do
 * formulário — mas o SALDO dele (`saldoFgts`) e o que ele faz a cada saque
 * (`abatimentoApeFgts`, `compraAVistaFgts`) aparecem linha a linha no diário de
 * bordo, não só escondidos dentro do aporte mensal. A cada 2 anos (prazo mínimo
 * legal para saque-amortização), ele primeiro abate o saldo devedor do APÊ (não
 * dos studios) — a parcela cai na mesma proporção do saldo (o banco mantém o
 * prazo, não a parcela), e essa QUEDA vira aporte mensal extra nos studios a
 * partir do mês seguinte. O que sobrar do saque (apê já quitado, ou saque maior
 * que o que faltava) compra studio À VISTA, sem financiar nada: a unidade ainda
 * passa pela obra, mas nasce sem saldo devedor — nunca é "financiada", só
 * "em construção" e depois "quitada" direto.
 *
 * Tudo isso — aporte mensal, aporte anual e a queda de parcela do apê — para de
 * entrar no caixa no ano de transição; os aluguéis continuam sendo reinvestidos,
 * então a carteira pode seguir comprando unidades novas sozinha.
 */
import type { MonthRow, PlannerParams, YearPoint } from './types'

const PCT_PAGO_CHAVES_MINIMO = 10

//: FGTS — regra do fundo, não escolha do autor do plano: por isso não é slider do formulário.
const FGTS_DEPOSITO_PCT = 8 // % do salário bruto, depósito patronal mensal
const FGTS_RENDIMENTO_ANUAL = 5.5 // % a.a. (TR + juros + distribuição de lucros)
const MES_DO_13O = 12 // o 13º salário também gera depósito de FGTS
const MESES_POR_SAQUE_FGTS = 24 // saque para amortizar financiamento imobiliário: a cada 2 anos

//: prazo de obra e de amortização do saldo financiado — realidade do mercado, não
//: escolha pessoal, por isso também não são sliders.
const PRAZO_OBRA_MESES = 30 // "24 a 36 meses" na conversa que originou o simulador
const PRAZO_FIN_HOLDING_MESES = 48 // "o próprio aluguel paga o saldo em 3 a 4 anos"

//: o caixa nunca deveria comprar centenas de unidades num mês só; é só uma rede de segurança.
const MAX_COMPRAS_POR_MES = 50

type Unidade = {
  mesPronto: number
  /** Equity fixo enquanto em construção — o que já foi pago, sem valorizar ainda. */
  pagoInicial: number
  /** Valor na entrega das chaves, já com o INCC da obra inteira embutido. */
  valorNaEntrega: number
  saldoFinanciado: number
  amortizacaoMensal: number
}

function taxaMensal(pctAnual: number): number {
  return Math.pow(1 + pctAnual / 100, 1 / 12) - 1
}

/** Mês do ano (1=jan … 12=dez) do mês-índice da simulação (1, 2, 3… desde o início). */
function mesDoAno(mes: number): number {
  return ((mes - 1) % 12) + 1
}

/** Valor de mercado de uma unidade PRONTA no mês `mes` (nunca chamado antes de `mesPronto`). */
function valorAtual(u: Unidade, mes: number, valorizacaoLiquidaAnual: number): number {
  const anosDesdeAEntrega = (mes - u.mesPronto) / 12
  return u.valorNaEntrega * Math.pow(1 + valorizacaoLiquidaAnual / 100, anosDesdeAEntrega)
}

export function simulateMonthly(p: PlannerParams): MonthRow[] {
  const meses = Math.round(p.years * 12)
  const pctChaves = Math.max(PCT_PAGO_CHAVES_MINIMO, p.pctPagoChaves) / 100
  const aluguelLiquidoMensal = (p.rate / 100) * (1 - p.impostoHolding / 100)
  const valorizacaoLiquidaAnual = p.incc - p.depreciacao
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)

  const precoNovoNoMes = (mes: number) => p.custoStudio * Math.pow(1 + p.incc / 100, mes / 12)

  let caixa = 0
  const unidades: Unidade[] = []

  // "Já pago no 1º studio": uma unidade já contratada desde hoje, em construção.
  if (p.initial > 0) {
    const fatorObra = Math.pow(1 + p.incc / 100, PRAZO_OBRA_MESES / 12)
    const saldoFinanciadoInicial = Math.max(0, (p.custoStudio - p.initial) * fatorObra)
    unidades.push({
      mesPronto: PRAZO_OBRA_MESES,
      pagoInicial: p.initial,
      valorNaEntrega: p.custoStudio * fatorObra,
      saldoFinanciado: saldoFinanciadoInicial,
      amortizacaoMensal: saldoFinanciadoInicial / PRAZO_FIN_HOLDING_MESES,
    })
  }

  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let salario = p.salarioBrutoCasal
  let parcelaApe = p.parcelaApeAtual
  let saldoApe = p.dividaApe
  let fgtsSaldo = 0
  let extraDoApe = 0

  const linhas: MonthRow[] = []

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

    // A cada 2 anos, o FGTS acumulado abate o saldo do apê primeiro; a parcela cai
    // na mesma proporção do saldo (prazo mantido), e a queda vira aporte mensal
    // dali em diante. O que sobrar (apê já quitado, ou saque maior que o saldo)
    // compra studio à vista, sem financiar nada.
    let abatimentoApeDoMes = 0
    let compraAVistaFgtsDoMes = 0
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
      let comprasAVista = 0
      while (comprasAVista < MAX_COMPRAS_POR_MES) {
        const precoNovo = precoNovoNoMes(mes)
        if (fgtsSaldo < precoNovo) break
        fgtsSaldo -= precoNovo
        compraAVistaFgtsDoMes += precoNovo
        const fatorObra = Math.pow(1 + p.incc / 100, PRAZO_OBRA_MESES / 12)
        unidades.push({
          mesPronto: mes + PRAZO_OBRA_MESES,
          pagoInicial: precoNovo,
          valorNaEntrega: precoNovo * fatorObra,
          saldoFinanciado: 0,
          amortizacaoMensal: 0,
        })
        comprasAVista++
      }
    }

    let aporteDoMes = 0
    let aporteAnualDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (mesDoAno(mes) === p.annualMonth) aporteAnualDoMes = aporteAnual
    }

    // Aluguel das unidades prontas e parcela das que ainda têm saldo financiado.
    let rendaDoMes = 0
    let parcelasDoMes = 0
    for (const u of unidades) {
      if (mes < u.mesPronto) continue
      rendaDoMes += valorAtual(u, mes, valorizacaoLiquidaAnual) * aluguelLiquidoMensal
      if (u.saldoFinanciado > 0) {
        const juros = u.saldoFinanciado * (p.jurosFinHolding / 100)
        parcelasDoMes += u.amortizacaoMensal + juros
        u.saldoFinanciado = Math.max(0, u.saldoFinanciado - u.amortizacaoMensal)
      }
    }

    caixa += aporteDoMes + aporteAnualDoMes + rendaDoMes - parcelasDoMes

    // O caixa compra quantas unidades novas der, ao preço de lançamento deste mês.
    let comprasNoMes = 0
    while (comprasNoMes < MAX_COMPRAS_POR_MES) {
      const precoNovo = precoNovoNoMes(mes)
      const entrada = precoNovo * pctChaves
      if (caixa < entrada) break
      caixa -= entrada
      const fatorObra = Math.pow(1 + p.incc / 100, PRAZO_OBRA_MESES / 12)
      const saldoFinanciadoInicial = precoNovo * fatorObra * (1 - pctChaves)
      unidades.push({
        mesPronto: mes + PRAZO_OBRA_MESES,
        pagoInicial: entrada,
        valorNaEntrega: precoNovo * fatorObra,
        saldoFinanciado: saldoFinanciadoInicial,
        amortizacaoMensal: saldoFinanciadoInicial / PRAZO_FIN_HOLDING_MESES,
      })
      comprasNoMes++
    }

    let imoveisEmConstrucao = 0
    let imoveisAlugados = 0
    let imoveisQuitados = 0
    let imoveisFinanciados = 0
    let patrimonioLiquido = caixa
    for (const u of unidades) {
      if (mes < u.mesPronto) {
        imoveisEmConstrucao++
        patrimonioLiquido += u.pagoInicial
        continue
      }
      imoveisAlugados++
      if (u.saldoFinanciado > 0) imoveisFinanciados++
      else imoveisQuitados++
      patrimonioLiquido += valorAtual(u, mes, valorizacaoLiquidaAnual) - u.saldoFinanciado
    }

    linhas.push({
      mes,
      anoDoPlano: Math.ceil(mes / 12),
      mesDoAno: mesDoAno(mes),
      aporteMensal: Math.round(aporteDoMes),
      aporteAnual: Math.round(aporteAnualDoMes),
      abatimentoApeFgts: Math.round(abatimentoApeDoMes),
      compraAVistaFgts: Math.round(compraAVistaFgtsDoMes),
      saldoFgts: Math.round(fgtsSaldo),
      imoveisEmConstrucao,
      imoveisAlugados,
      imoveisQuitados,
      imoveisFinanciados,
      totalImoveis: unidades.length,
      totalParcelasFinanciamento: Math.round(parcelasDoMes),
      rendaMensalLiquida: Math.round(rendaDoMes),
      patrimonioLiquido: Math.round(patrimonioLiquido),
    })
  }

  return linhas
}

export function simulate(p: PlannerParams): YearPoint[] {
  const linhas = simulateMonthly(p)
  const pontos: YearPoint[] = [{
    ano: 0,
    patrimonioLiquido: Math.round(p.initial),
    precoStudioNovo: Math.round(p.custoStudio),
    studiosComChaves: 0,
    studiosQuitadosEquiv: 0,
    rendaMensalLiquida: 0,
  }]
  for (const linha of linhas) {
    if (linha.mes % 12 !== 0) continue
    const ano = linha.mes / 12
    pontos.push({
      ano,
      patrimonioLiquido: linha.patrimonioLiquido,
      precoStudioNovo: Math.round(p.custoStudio * Math.pow(1 + p.incc / 100, ano)),
      studiosComChaves: linha.imoveisAlugados,
      studiosQuitadosEquiv: linha.imoveisQuitados,
      rendaMensalLiquida: linha.rendaMensalLiquida,
    })
  }
  return pontos
}
