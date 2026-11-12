/**
 * Motor puro do simulador "Vivendo de Imóveis" — uma estratégia: comprar direto na
 * holding, financiando o saldo remanescente nas chaves (ver types.ts). Sem rede,
 * sem Firestore; só matemática, testada em calc.test.ts.
 *
 * Cada studio é uma UNIDADE discreta, com o próprio ciclo de vida. Há DOIS jeitos
 * de uma unidade entrar na carteira:
 *
 * 1. NA PLANTA (o caixa: aportes + aluguéis − parcelas − custos). Paga
 *    `pctPagoChaves`% do preço do lançamento + a documentação (ITBI, escritura,
 *    registro) na hora, e espera a obra inteira (`prazoObraMeses`) — durante a obra
 *    não aluga e o equity fica PARADO no que foi pago. Na entrega o valor pula para
 *    o preço já corrigido pelo INCC da obra, e o saldo não pago amortiza em SAC em
 *    `PRAZO_FIN_HOLDING_MESES`, a `jurosFinHolding` ao mês.
 * 2. PRONTA, À VISTA (sobra do FGTS, ou dinheiro de uma venda). FGTS não compra
 *    imóvel em obra, e o dinheiro à vista negocia desconto (`descontoAVista`): paga
 *    o preço de mercado do mês com desconto, a unidade nasce alugada e quitada, e a
 *    diferença para o valor de mercado vira patrimônio na hora. A documentação NÃO
 *    pode sair do FGTS — sai do caixa.
 *
 * O aluguel de uma unidade pronta passa por `contaDoAluguel`: vacância (meses vagos
 * por ano), imposto da holding, taxa da imobiliária, IPTU e condomínio (de quem o
 * usuário escolher — vago, é sempre do dono) e manutenção.
 *
 * Todo dezembro o sistema avalia VENDER cada unidade pronta e quitada (ver
 * `avaliaVenda`): compara ficar com ela por mais um tempo de obra contra vender
 * (pagando corretagem e imposto) e pôr o dinheiro numa planta ou num pronto com
 * desconto. Só vende com folga (`FOLGA_VENDA`) — com os padrões, alugar sempre vence.
 *
 * FGTS do casal: 8% do salário (+ 13º em dezembro), rende a taxa legal; a cada 2
 * anos abate primeiro o saldo do APÊ (a queda da parcela vira aporte mensal extra)
 * e o que sobra compra studio pronto, se o preço couber no teto do FGTS.
 *
 * Aporte mensal, anual e a queda de parcela do apê param no ano de transição; os
 * aluguéis continuam sendo reinvestidos.
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
  /** Equity fixo enquanto em construção — o que já foi pago, sem valorizar ainda. */
  pagoInicial: number
  /** Valor de mercado no mês em que fica pronta (planta: já com o INCC da obra). */
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
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)

  const precoNovoNoMes = (mes: number) => p.custoStudio * Math.pow(1 + p.incc / 100, mes / 12)

  let caixa = 0
  const unidades: Unidade[] = []

  const comprarPronta = (mes: number, precoMercado: number) => {
    const precoPago = precoMercado * (1 - p.descontoAVista / 100)
    unidades.push({ mesPronto: mes, pagoInicial: precoPago, valorNaEntrega: precoMercado, saldoFinanciado: 0, amortizacaoMensal: 0 })
    return precoPago
  }

  // "Já pago no 1º studio": uma unidade já contratada desde hoje, em construção.
  if (p.initial > 0) {
    const saldoFinanciadoInicial = Math.max(0, (p.custoStudio - p.initial) * fatorObra)
    unidades.push({
      mesPronto: prazoObra,
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

    // A cada 2 anos, o FGTS abate o saldo do apê primeiro; a parcela cai na mesma
    // proporção do saldo (prazo mantido), e a queda vira aporte mensal dali em diante.
    // O que sobrar compra studio PRONTO à vista — FGTS não compra imóvel em obra.
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
      const precoMercado = precoNovoNoMes(mes)
      const cabeNoTeto = p.fgtsTetoImovel > 0 && precoMercado <= p.fgtsTetoImovel
      const precoComDesconto = precoMercado * (1 - p.descontoAVista / 100)
      let comprasAVista = 0
      while (cabeNoTeto && comprasAVista < MAX_COMPRAS_POR_MES && fgtsSaldo >= precoComDesconto) {
        const pago = comprarPronta(mes, precoMercado)
        fgtsSaldo -= pago
        caixa -= pago * docs // ITBI e cartório não saem do FGTS
        compraAVistaFgtsDoMes += pago
        comprasAVista++
      }
    }

    let aporteDoMes = 0
    let aporteAnualDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (mesDoAno(mes) === p.annualMonth) aporteAnualDoMes = aporteAnual
    }

    // Aluguel (já líquido de custos) das unidades prontas e parcela das que ainda devem.
    let rendaDoMes = 0
    let custosDoMes = 0
    let parcelasDoMes = 0
    for (const u of unidades) {
      if (mes < u.mesPronto) continue
      const conta = contaDoAluguel(valorAtual(u, mes, valorizacaoLiquidaAnual), p)
      rendaDoMes += conta.liquido
      custosDoMes += conta.custos
      if (u.saldoFinanciado > 0) {
        const juros = u.saldoFinanciado * (p.jurosFinHolding / 100)
        parcelasDoMes += u.amortizacaoMensal + juros
        u.saldoFinanciado = Math.max(0, u.saldoFinanciado - u.amortizacaoMensal)
      }
    }

    caixa += aporteDoMes + aporteAnualDoMes + rendaDoMes - parcelasDoMes

    // Venda: uma vez por ano, unidade a unidade — só as prontas e quitadas.
    let vendasDoMes = 0
    let valorVendasDoMes = 0
    if (mesDoAno(mes) === MES_AVALIA_VENDA) {
      const precoPronto = precoNovoNoMes(mes)
      const custoPronto = precoPronto * (1 - p.descontoAVista / 100) * (1 + docs)
      for (let i = unidades.length - 1; i >= 0; i--) {
        const u = unidades[i]
        if (mes < u.mesPronto || u.saldoFinanciado > 0) continue
        const decisao = avaliaVenda(valorAtual(u, mes, valorizacaoLiquidaAnual), precoPronto, custoPronto, pctChaves, docs, fatorObra, prazoObra, p)
        if (!decisao) continue
        unidades.splice(i, 1)
        vendasDoMes++
        valorVendasDoMes += decisao.liquido
        let sobra = decisao.liquido
        if (decisao.destino === 'pronto') {
          let compras = 0
          while (sobra >= custoPronto && compras < MAX_COMPRAS_POR_MES) {
            sobra -= comprarPronta(mes, precoPronto) * (1 + docs)
            compras++
          }
        }
        caixa += sobra // destino "planta": o caixa compra logo abaixo, neste mesmo mês
      }
    }

    // O caixa compra na planta quantas unidades der, ao preço de lançamento deste mês.
    let comprasNoMes = 0
    while (comprasNoMes < MAX_COMPRAS_POR_MES) {
      const precoNovo = precoNovoNoMes(mes)
      const entrada = precoNovo * pctChaves
      if (caixa < entrada + precoNovo * docs) break
      caixa -= entrada + precoNovo * docs
      const saldoFinanciadoInicial = precoNovo * fatorObra * (1 - pctChaves)
      unidades.push({
        mesPronto: mes + prazoObra,
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
      custosImovel: Math.round(custosDoMes),
      rendaMensalLiquida: Math.round(rendaDoMes),
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
