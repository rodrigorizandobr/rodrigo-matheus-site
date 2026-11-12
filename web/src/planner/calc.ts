/**
 * Motor puro do simulador "Vivendo de Imóveis" — comprar direto na holding, financiando
 * o saldo remanescente nas chaves (ver types.ts). Sem rede, sem Firestore; só
 * matemática, testada em calc.test.ts.
 *
 * Cada studio é uma UNIDADE discreta. Três jeitos de entrar na carteira:
 *
 * 1. NA OBRA, pelo PLANEJADOR (o caixa). Todo mês o motor projeta as entradas e
 *    saídas já conhecidas (aportes até a transição, aluguéis, parcelas, o que as
 *    unidades em obra ainda devem) e procura o studio com MENOS meses de obra
 *    faltando que essa projeção consegue pagar: quem tem o dinheiro na mão compra
 *    pronto (0 meses); quem junta em 12 meses compra o que entrega em 12. Até as
 *    chaves paga `pctPagoChaves`% + documentação — o que falta é corrigido pelo
 *    INCC, e todo dinheiro que a projeção mostra que não vai fazer falta é
 *    adiantado. O resto vira financiamento em SAC nas chaves
 *    (`PRAZO_FIN_HOLDING_MESES`, `jurosFinHolding` ao mês). Só se compromete se o
 *    saldo projetado nunca ficar negativo (ver `caminhoDoCaixa`).
 * 2. PRONTA com FGTS: sem saldo devedor no apê, assim que FGTS + caixa livre pagam
 *    um studio pronto (com `descontoAVista`), compra — o FGTS entra primeiro, a
 *    documentação sai do caixa. Nasce alugada e quitada.
 * 3. PRONTA com o dinheiro de uma VENDA (ver `avaliaVenda`, todo dezembro).
 *
 * O aluguel de uma unidade pronta passa por `contaDoAluguel`: vacância, imposto,
 * imobiliária, IPTU e condomínio (vago, é sempre do dono) e manutenção.
 *
 * FGTS do casal: 8% do salário (+ 13º em dezembro), rende a taxa legal; enquanto o
 * apê tem saldo devedor, a cada 2 anos abate o apê (a queda da parcela vira aporte
 * mensal extra).
 *
 * Aporte mensal, anual e a queda de parcela do apê param no ano de transição; os
 * aluguéis continuam comprando studios sozinhos.
 */
import type { MonthRow, Pagador, PlannerParams, YearPoint } from './types'

const PCT_PAGO_CHAVES_MINIMO = 10

//: FGTS — regra do fundo, não escolha do autor do plano: por isso não é slider do formulário.
const FGTS_DEPOSITO_PCT = 8 // % do salário bruto, depósito patronal mensal
const FGTS_RENDIMENTO_ANUAL = 5.5 // % a.a. (TR + juros + distribuição de lucros)
const MES_DO_13O = 12 // o 13º salário também gera depósito de FGTS
const MESES_POR_SAQUE_FGTS = 24 // saque para amortizar financiamento imobiliário: a cada 2 anos

//: "o próprio aluguel paga o saldo em 3 a 4 anos" — realidade do mercado, não escolha pessoal.
const PRAZO_FIN_HOLDING_MESES = 48

//: o caixa nunca deveria comprar centenas de unidades num mês só; é só uma rede de segurança.
const MAX_COMPRAS_POR_MES = 50

//: venda: avaliada uma vez por ano, e só sai se a melhor alternativa ganhar de manter com folga —
//: senão a carteira gira por centavos de diferença numa conta que é estimativa.
const MES_AVALIA_VENDA = 12
const FOLGA_VENDA = 0.05

type Unidade = {
  mesPronto: number
  /** Equity enquanto em obra — o que já foi pago do imóvel (sem documentação). */
  pago: number
  /** Valor de mercado no mês em que fica pronta (obra: já com o INCC até a entrega). */
  valorNaEntrega: number
  saldoFinanciado: number
  amortizacaoMensal: number
  /** Entrada + documentação ainda devidas até as chaves, corrigidas pelo INCC todo mês. */
  restante: number
  /** Fatia de cada pagamento de obra que é documentação, não imóvel. */
  fracaoDocs: number
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

/** ITBI + escritura + registro, como fração do preço pago. */
function fracaoDocumentacao(p: PlannerParams): number {
  return (p.itbiPct + p.escrituraPct + p.registroPct) / 100
}

/**
 * O mês de UMA unidade pronta que vale `valor`: o que sobra do aluguel depois de
 * vacância, imposto, imobiliária, IPTU/condomínio e manutenção. Vago, quem paga
 * IPTU e condomínio é o dono — mesmo que o contrato passe isso ao inquilino.
 */
export function contaDoAluguel(valor: number, p: PlannerParams): { liquido: number; custos: number } {
  const fracaoVaga = Math.min(12, Math.max(0, p.vacanciaMesesAno)) / 12
  const recebido = valor * (p.rate / 100) * (1 - fracaoVaga)
  const doDono = (pagador: Pagador, mensal: number) => (pagador === 'proprietario' ? mensal : mensal * fracaoVaga)
  const custos =
    recebido * (p.impostoHolding / 100) +
    recebido * (p.taxaAdmPct / 100) +
    doDono(p.iptuPagador, (valor * p.iptuPctAno) / 100 / 12) +
    doDono(p.condominioPagador, (valor * p.condominioPctAno) / 100 / 12) +
    (valor * p.manutencaoPctAno) / 100 / 12
  return { liquido: recebido - custos, custos }
}

export function simulateMonthly(p: PlannerParams): MonthRow[] {
  const meses = Math.round(p.years * 12)
  const prazoObra = Math.max(1, Math.round(p.prazoObraMeses))
  const pctChaves = Math.max(PCT_PAGO_CHAVES_MINIMO, p.pctPagoChaves) / 100
  const docs = fracaoDocumentacao(p)
  const valorizacaoLiquidaAnual = p.incc - p.depreciacao
  const fatorObra = Math.pow(1 + p.incc / 100, prazoObra / 12)
  const inccMensal = Math.pow(1 + p.incc / 100, 1 / 12)
  const juros = p.jurosFinHolding / 100
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)
  const mesTransicao = p.anoTransicao * 12
  // A projeção cobre a obra mais longa e o financiamento inteiro de quem for comprado hoje.
  const horizonte = prazoObra + PRAZO_FIN_HOLDING_MESES

  const precoNovoNoMes = (mes: number) => p.custoStudio * Math.pow(1 + p.incc / 100, mes / 12)

  let caixa = 0
  let comprasDoMes = 0
  let docsDoMes = 0
  const unidades: Unidade[] = []

  const pagarObra = (u: Unidade, valor: number) => {
    u.restante -= valor
    u.pago += valor * (1 - u.fracaoDocs)
    caixa -= valor
    comprasDoMes += valor * (1 - u.fracaoDocs)
    docsDoMes += valor * u.fracaoDocs
  }

  /** Studio pronto, à vista com desconto: `doFgts` abate o preço, o caixa completa e paga a documentação. */
  const comprarPronta = (mes: number, precoMercado: number, doFgts: number) => {
    const precoPago = precoMercado * (1 - p.descontoAVista / 100)
    caixa -= precoPago - doFgts + precoPago * docs
    comprasDoMes += precoPago - doFgts
    docsDoMes += precoPago * docs
    unidades.push({ mesPronto: mes, pago: precoPago, valorNaEntrega: precoMercado, saldoFinanciado: 0, amortizacaoMensal: 0, restante: 0, fracaoDocs: 0 })
  }

  // "Já pago no 1º studio": uma unidade já contratada desde hoje, em construção.
  if (p.initial > 0) {
    const saldoFinanciadoInicial = Math.max(0, (p.custoStudio - p.initial) * fatorObra)
    unidades.push({
      mesPronto: prazoObra,
      pago: p.initial,
      valorNaEntrega: p.custoStudio * fatorObra,
      saldoFinanciado: saldoFinanciadoInicial,
      amortizacaoMensal: saldoFinanciadoInicial / PRAZO_FIN_HOLDING_MESES,
      restante: 0,
      fracaoDocs: 0,
    })
  }

  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let salario = p.salarioBrutoCasal
  let parcelaApe = p.parcelaApeAtual
  let saldoApe = p.dividaApe
  let fgtsSaldo = 0
  let extraDoApe = 0

  /**
   * O saldo do caixa mês a mês daqui pra frente (índice 0 = hoje), só com o que já
   * é conhecido e do jeito mais prudente: aportes de hoje até a transição (sem
   * dissídio futuro), aluguel de cada unidade congelado no valor de hoje, parcelas
   * em SAC, e o que cada unidade em obra ainda deve cobrado INTEIRO no mês das
   * chaves. Se o mínimo deste caminho é >= 0, o caixa aguenta tudo que já assumiu;
   * o mínimo é também o dinheiro que pode ser gasto hoje sem fazer falta depois.
   */
  const caminhoDoCaixa = (mes: number): Float64Array => {
    const fluxo = new Float64Array(horizonte + 1)
    for (let k = 1; k <= horizonte; k++) {
      const m = mes + k
      if (m > mesTransicao) break
      fluxo[k] += aporteMensal + extraDoApe
      if (mesDoAno(m) === p.annualMonth) fluxo[k] += aporteAnual
    }
    for (const u of unidades) {
      const valor = mes >= u.mesPronto ? valorAtual(u, mes, valorizacaoLiquidaAnual) : u.valorNaEntrega
      const aluguel = contaDoAluguel(valor, p).liquido
      let saldo = u.saldoFinanciado
      for (let k = Math.max(1, u.mesPronto - mes); k <= horizonte; k++) {
        fluxo[k] += aluguel
        if (saldo > 0) {
          fluxo[k] -= u.amortizacaoMensal + saldo * juros
          saldo = Math.max(0, saldo - u.amortizacaoMensal)
        }
      }
      const k = u.mesPronto - mes
      if (u.restante > 0 && k > 0 && k <= horizonte) fluxo[k] -= u.restante * Math.pow(inccMensal, k)
    }
    let s = caixa
    for (let k = 0; k <= horizonte; k++) { s += fluxo[k]; fluxo[k] = s }
    return fluxo
  }
  const folga = (mes: number) => caminhoDoCaixa(mes).reduce((a, b) => Math.min(a, b), Infinity)

  /** O caminho continua >= 0 comprando hoje um studio que entrega em `r` meses? */
  const cabeNaObra = (caminho: Float64Array, r: number, preco: number): boolean => {
    const valor = preco * Math.pow(inccMensal, r)
    const aluguel = contaDoAluguel(valor, p).liquido
    let saldo = valor * (1 - pctChaves)
    const amortizacao = saldo / PRAZO_FIN_HOLDING_MESES
    let efeito = 0
    for (let k = 0; k <= horizonte; k++) {
      if (k === r) efeito -= (pctChaves + docs) * valor
      if (k > r) {
        efeito += aluguel
        if (saldo > 0) { efeito -= amortizacao + saldo * juros; saldo = Math.max(0, saldo - amortizacao) }
      }
      if (caminho[k] + efeito < -0.01) return false
    }
    return true
  }

  const novaNaObra = (mes: number, r: number, preco: number): Unidade => {
    const valorNaEntrega = preco * Math.pow(inccMensal, r)
    const saldoFinanciadoInicial = valorNaEntrega * (1 - pctChaves)
    return {
      mesPronto: mes + r,
      pago: 0,
      valorNaEntrega,
      saldoFinanciado: saldoFinanciadoInicial,
      amortizacaoMensal: saldoFinanciadoInicial / PRAZO_FIN_HOLDING_MESES,
      restante: (pctChaves + docs) * preco,
      fracaoDocs: docs / (pctChaves + docs),
    }
  }

  const linhas: MonthRow[] = []

  for (let mes = 1; mes <= meses; mes++) {
    comprasDoMes = 0
    docsDoMes = 0
    const transicionou = mes > mesTransicao
    if (!transicionou && mesDoAno(mes) === p.mesDissidio) {
      aporteMensal *= 1 + p.dissidio / 100
      aporteAnual *= 1 + p.dissidio / 100
      salario *= 1 + p.dissidio / 100
    }

    // FGTS: rende todo mês e recebe o depósito patronal — o do 13º soma em dezembro.
    fgtsSaldo *= 1 + fgtsRendimentoMensal
    fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)
    if (mesDoAno(mes) === MES_DO_13O) fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)

    // Com saldo devedor no apê, a cada 2 anos o FGTS abate o apê; a parcela cai na
    // mesma proporção do saldo (prazo mantido), e a queda vira aporte mensal.
    let abatimentoApeDoMes = 0
    if (saldoApe > 0 && mes % MESES_POR_SAQUE_FGTS === 0) {
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

    let aporteDoMes = 0
    let aporteAnualDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (mesDoAno(mes) === p.annualMonth) aporteAnualDoMes = aporteAnual
    }
    caixa += aporteDoMes + aporteAnualDoMes

    // Obra: o que falta pagar é corrigido pelo INCC; nas chaves, quita o que restar.
    for (const u of unidades) {
      if (u.restante <= 0) continue
      u.restante *= inccMensal
      if (mes >= u.mesPronto) pagarObra(u, u.restante)
    }

    // Aluguel das unidades prontas e parcela das que ainda devem.
    let recebidoDoMes = 0
    let custosDoMes = 0
    let parcelasDoMes = 0
    for (const u of unidades) {
      if (mes < u.mesPronto) continue
      const conta = contaDoAluguel(valorAtual(u, mes, valorizacaoLiquidaAnual), p)
      recebidoDoMes += conta.liquido + conta.custos
      custosDoMes += conta.custos
      if (u.saldoFinanciado > 0) {
        parcelasDoMes += u.amortizacaoMensal + u.saldoFinanciado * juros
        u.saldoFinanciado = Math.max(0, u.saldoFinanciado - u.amortizacaoMensal)
      }
    }
    caixa += recebidoDoMes - custosDoMes - parcelasDoMes

    const precoDoMes = precoNovoNoMes(mes)
    const precoPronto = precoDoMes * (1 - p.descontoAVista / 100)

    // Venda: uma vez por ano, unidade a unidade — só as prontas e quitadas.
    let vendasDoMes = 0
    let valorVendasDoMes = 0
    if (mesDoAno(mes) === MES_AVALIA_VENDA) {
      const custoPronto = precoPronto * (1 + docs)
      for (let i = unidades.length - 1; i >= 0; i--) {
        const u = unidades[i]
        if (mes < u.mesPronto || u.saldoFinanciado > 0) continue
        const decisao = avaliaVenda(valorAtual(u, mes, valorizacaoLiquidaAnual), precoDoMes, custoPronto, pctChaves, docs, fatorObra, prazoObra, p)
        if (!decisao) continue
        // Vende de mentira primeiro: só vale se o dinheiro conseguir virar outro studio
        // sem estourar o caixa lá na frente — senão a unidade fica onde está.
        unidades.splice(i, 1)
        caixa += decisao.liquido
        const reaplica = decisao.destino === 'pronto'
          ? folga(mes) >= custoPronto
          : cabeNaObra(caminhoDoCaixa(mes), prazoObra, precoDoMes)
        if (!reaplica) {
          caixa -= decisao.liquido
          unidades.splice(i, 0, u)
          continue
        }
        vendasDoMes++
        valorVendasDoMes += decisao.liquido
        if (decisao.destino === 'pronto') {
          for (let n = 0; n < MAX_COMPRAS_POR_MES && folga(mes) >= custoPronto; n++) comprarPronta(mes, precoDoMes, 0)
        } else {
          // lançamentos (obra inteira pela frente): é onde está o ganho que justificou a venda
          const teto = Math.floor(decisao.liquido / ((pctChaves + docs) * precoDoMes))
          for (let n = 0; n < teto && cabeNaObra(caminhoDoCaixa(mes), prazoObra, precoDoMes); n++) {
            unidades.push(novaNaObra(mes, prazoObra, precoDoMes))
          }
        }
      }
    }

    // FGTS: com o apê quitado, compra studio pronto assim que FGTS + caixa livre fecham a conta.
    let compraAVistaFgtsDoMes = 0
    for (let n = 0; saldoApe <= 0 && fgtsSaldo > 0 && n < MAX_COMPRAS_POR_MES; n++) {
      const doFgts = Math.min(fgtsSaldo, precoPronto)
      if (precoPronto - doFgts + precoPronto * docs > Math.max(0, folga(mes))) break
      comprarPronta(mes, precoDoMes, doFgts)
      fgtsSaldo -= doFgts
      compraAVistaFgtsDoMes += doFgts
    }

    // Planejador: compra o studio com menos obra pela frente que o caixa projetado paga.
    for (let n = 0; n < MAX_COMPRAS_POR_MES; n++) {
      const caminho = caminhoDoCaixa(mes)
      let r = 0
      while (r <= prazoObra && !cabeNaObra(caminho, r, precoDoMes)) r++
      if (r > prazoObra) break
      const nova = novaNaObra(mes, r, precoDoMes)
      unidades.push(nova)
      if (r === 0) pagarObra(nova, nova.restante)
    }

    // Adianta, na obra que entrega primeiro, todo dinheiro que não vai fazer falta.
    let livre = folga(mes)
    for (const u of [...unidades].sort((a, b) => a.mesPronto - b.mesPronto)) {
      if (livre <= 0.01) break
      if (u.restante <= 0) continue
      const valor = Math.min(livre, u.restante)
      pagarObra(u, valor)
      livre -= valor
    }

    let imoveisEmConstrucao = 0
    let imoveisAlugados = 0
    let imoveisQuitados = 0
    let imoveisFinanciados = 0
    let patrimonioLiquido = caixa
    for (const u of unidades) {
      if (mes < u.mesPronto) {
        imoveisEmConstrucao++
        patrimonioLiquido += u.pago
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
      aluguelRecebido: Math.round(recebidoDoMes),
      comprasImoveis: Math.round(comprasDoMes),
      documentacao: Math.round(docsDoMes),
      saldo: Math.round(caixa),
      custosImovel: Math.round(custosDoMes),
      rendaMensalLiquida: Math.round(recebidoDoMes - custosDoMes),
      vendas: vendasDoMes,
      valorVendas: Math.round(valorVendasDoMes),
      patrimonioLiquido: Math.round(patrimonioLiquido),
    })
  }

  return linhas
}

/**
 * Vale vender uma unidade que vale `valor` hoje? Compara, num horizonte de UM
 * tempo de obra (o "3 anos de aluguel" contra "um studio que fica pronto em 3
 * anos"), três caminhos — devolve `null` para manter:
 *
 * - MANTER: o valor dela no fim do horizonte + o aluguel líquido do período.
 * - PLANTA: o líquido da venda (sem corretagem e imposto) vira entrada + documentação
 *   de studios na planta; no fim da obra o equity é `pctChaves` do valor de entrega.
 * - PRONTO: o líquido compra studio pronto à vista com desconto (+ documentação),
 *   que valoriza e aluga desde já — o "vender caro e comprar mais barato".
 *
 * Conta contínua (fração de unidade) para a COMPARAÇÃO; a execução compra só
 * unidades inteiras e o resto vai pro caixa.
 */
function avaliaVenda(
  valor: number, precoPronto: number, custoPronto: number, pctChaves: number, docs: number,
  fatorObra: number, horizonte: number, p: PlannerParams,
): { liquido: number; destino: 'planta' | 'pronto' } | null {
  const crescimento = Math.pow(1 + (p.incc - p.depreciacao) / 100, horizonte / 12)
  const aluguelNoPeriodo = (v: number) => contaDoAluguel(v * Math.sqrt(crescimento), p).liquido * horizonte

  const manter = valor * crescimento + aluguelNoPeriodo(valor)
  const liquido = valor * (1 - (p.corretagemVendaPct + p.impostoVendaPct) / 100)
  const planta = (liquido * pctChaves * fatorObra) / (pctChaves + docs)
  const pronto = (liquido / custoPronto) * (precoPronto * crescimento + aluguelNoPeriodo(precoPronto))

  if (Math.max(planta, pronto) <= manter * (1 + FOLGA_VENDA)) return null
  return { liquido, destino: pronto >= planta ? 'pronto' : 'planta' }
}

export function simulate(p: PlannerParams): YearPoint[] {
  return pontosAnuais(simulateMonthly(p), p)
}

/** Os pontos do gráfico, derivados de um diário já calculado — a tela não simula duas vezes. */
export function pontosAnuais(linhas: MonthRow[], p: PlannerParams): YearPoint[] {
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
