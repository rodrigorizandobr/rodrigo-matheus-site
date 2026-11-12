/**
 * Motor puro do simulador "Vivendo de Imóveis" — comprar na planta pelo PLANO INVESTIDOR da
 * construtora (sem juros, só correção pelo índice da obra), direto na holding. Sem rede, sem
 * Firestore; só matemática, testada em calc.test.ts.
 *
 * Cada studio é uma UNIDADE discreta. Jeitos de entrar na carteira:
 *
 * 1. NA OBRA, pelo PLANEJADOR (o caixa). Todo mês o motor projeta as entradas e saídas já
 *    conhecidas (aportes até a transição, aluguéis, parcelas, o que cada obra ainda deve) e
 *    procura o studio com MENOS meses de obra faltando que essa projeção consegue pagar — sempre
 *    sobrando a reserva mínima. O contrato (entrada, mensais, reforços, chaves, resto depois das
 *    chaves) vem de contrato.ts; no modo simples é só "X% até as chaves".
 * 2. PRONTA com FGTS: sem saldo devedor no apê, assim que FGTS + caixa livre pagam um studio
 *    pronto (com `descontoAVista`), compra.
 * 3. PRONTA com o dinheiro de uma VENDA (ver `avaliaVenda`, todo dezembro).
 * 4. PRONTA por consórcio: a carta é contemplada no mês que a pessoa supôs (consorcio.ts).
 *
 * Aportes, e a queda de parcela do apê, param no ano de transição; no modo "vivo da renda" a
 * pessoa também para de trabalhar (FGTS) e passa a retirar a meta dos aluguéis.
 *
 * Todo recurso novo tem valor NEUTRO (neutro.ts) com o qual o motor é o do commit f81ad5e.
 */
import { dataDoMes, INICIO_PADRAO, type Inicio } from './calendario'
import { parcelaSac } from './credito'
import { cronograma, pctAteChaves, prazoPosChaves, type ContextoCronograma } from './contrato'
import { carta, planoDaCota, taxaCons } from './consorcio'
import { fatorPreco } from './inflacao'
import { impostoAluguelLonga } from './imposto'
import { liquidoVendaNasChaves, precoLancamento, precoNaObra, valorPronto, vendeNasChaves } from './planta'
import { contaTemporada } from './temporada'
import type { MonthRow, Pagador, PlannerParams, YearPoint } from './types'

const PCT_PAGO_CHAVES_MINIMO = 10

//: FGTS — regra do fundo, não escolha do autor do plano: por isso não é slider do formulário.
const FGTS_DEPOSITO_PCT = 8 // % do salário bruto, depósito patronal mensal
const FGTS_RENDIMENTO_ANUAL = 5.5 // % a.a. (TR + juros + distribuição de lucros)
const MES_DO_13O = 12 // o 13º salário também gera depósito de FGTS
const MESES_POR_SAQUE_FGTS = 24 // saque para amortizar financiamento imobiliário: a cada 2 anos

//: o caixa nunca deveria comprar centenas de unidades num mês só; é só uma rede de segurança.
const MAX_COMPRAS_POR_MES = 50

//: venda: avaliada uma vez por ano, e só sai se a melhor alternativa ganhar de manter com folga —
//: senão a carteira gira por centavos de diferença numa conta que é estimativa.
const MES_AVALIA_VENDA = 12
const FOLGA_VENDA = 0.05

type Parcela = { mes: number; pct: number }

type Unidade = {
  mesPronto: number
  /** Primeiro mês com inquilino: as chaves + o tempo até alugar. */
  mesAlugavel: number
  /** Equity enquanto em obra — o que já foi pago do imóvel (sem documentação). */
  pago: number
  /** Valor de mercado no mês em que fica pronta (obra: já com o INCC até a entrega). */
  valorNaEntrega: number
  saldoFinanciado: number
  mesesRestantesFin: number
  /** Modo simples: entrada + documentação ainda devidas até as chaves, corrigidas todo mês. */
  restante: number
  /** Modo simples: fatia de cada pagamento de obra que é documentação, não imóvel. */
  fracaoDocs: number
  /** Modo contrato: o que falta pagar, em % do preço de contrato, com o mês de cada parcela. */
  parcelas: Parcela[]
  precoContrato: number
  mesCompra: number
  docsAPagar: number
  montada: boolean
  daPlanta: boolean
}

type Cota = { fracaoPaga: number; contemplada: boolean; mesPlanejado: number }

type Projecao = {
  /** Aportes, parcelas de obra, compras já combinadas. */
  pontual: Float64Array
  /** Aluguel líquido, parcelas de financiamento, apê, custo fixo, consórcio. */
  recorrente: Float64Array
  /** Retirada desejada em cada mês futuro (0 antes da transição ou no modo "reinveste"). */
  meta: Float64Array
  /** Saídas obrigatórias (positivas), para a reserva e o estresse. */
  saidas: Float64Array
  /** Saldo projetado do caixa, já com a retirada. */
  caminho: Float64Array
}

export function taxaMensal(pctAnual: number): number {
  return Math.pow(1 + pctAnual / 100, 1 / 12) - 1
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
 * O mês de UMA unidade pronta e ALUGADA no modo tradicional que vale `valor`: o que sobra do
 * aluguel depois de vacância, imposto, imobiliária, IPTU/condomínio e manutenção. Vago, quem paga
 * IPTU e condomínio é o dono — mesmo que o contrato passe isso ao inquilino.
 */
export function contaDoAluguel(valor: number, p: PlannerParams, ano?: number): { liquido: number; custos: number } {
  const fracaoVaga = Math.min(12, Math.max(0, p.vacanciaMesesAno)) / 12
  const cheio = valor * (p.rate / 100)
  const recebido = cheio * (1 - fracaoVaga)
  const doDono = (pagador: Pagador, mensal: number) => (pagador === 'proprietario' ? mensal : mensal * fracaoVaga)
  const custos =
    impostoAluguelLonga(cheio, 1 - fracaoVaga, ano, p) +
    recebido * (p.taxaAdmPct / 100) +
    doDono(p.iptuPagador, (valor * p.iptuPctAno) / 100 / 12) +
    doDono(p.condominioPagador, (valor * p.condominioPctAno) / 100 / 12) +
    (valor * p.manutencaoPctAno) / 100 / 12
  return { liquido: recebido - custos, custos }
}

/** Renda de uma unidade pronta e alugada: a mistura de aluguel tradicional e temporada. */
export function rendaDaUnidade(valor: number, mes: number, ano: number | undefined, p: PlannerParams): { liquido: number; custos: number } {
  const f = Math.min(100, Math.max(0, p.pctTemporada)) / 100
  const longa = contaDoAluguel(valor, p, ano)
  if (f === 0) return longa
  const temp = contaTemporada(valor, mes, p)
  return { liquido: (1 - f) * longa.liquido + f * temp.liquido, custos: (1 - f) * longa.custos + f * temp.custos }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function simulateMonthly(p: PlannerParams, inicio: Inicio = INICIO_PADRAO): MonthRow[] {
  const meses = Math.round(p.years * 12)
  const prazoObra = Math.max(1, Math.round(p.prazoObraMeses))
  const contrato = p.cronograma === 'contrato'
  const pctChaves = (contrato ? pctAteChaves(p) : Math.max(PCT_PAGO_CHAVES_MINIMO, p.pctPagoChaves)) / 100
  const docs = fracaoDocumentacao(p)
  const valorizacaoLiquidaAnual = p.incc - p.depreciacao
  const inccMensal = Math.pow(1 + p.incc / 100, 1 / 12)
  const inccObraMensal = p.correcaoObraModo === 'incc' ? inccMensal : Math.pow(1 + p.correcaoObraAno / 100, 1 / 12)
  /** Depois das chaves o saldo do plano investidor corre pelo IPCA (até as chaves, pelo índice da obra); no modo simples não corre. */
  const correcaoPos = contrato ? Math.pow(1 + p.correcaoPosChavesAno / 100, 1 / 12) - 1 : 0
  const jurosFin = contrato ? 0 : p.jurosFinHolding / 100
  const prazoFin = prazoPosChaves(p)
  const r1 = Math.round(clamp(p.mesesEntrega1o, 0, 120))
  const mesesAlug = Math.round(clamp(p.mesesAteAlugar, 0, 12))
  const mesTransicao = p.anoTransicao * 12
  const vive = p.aposTransicao === 'vive_da_renda'
  const rendimentoCaixaMensal = taxaMensal(p.rendimentoCaixaAno)
  const fgtsRendimentoMensal = taxaMensal(FGTS_RENDIMENTO_ANUAL)
  const nCotas = Math.round(clamp(p.consorcioCotas, 0, 20))
  const planoCons = planoDaCota(p)
  const horizonteBase = Math.max(prazoObra, r1) + prazoFin + mesesAlug
  // A projeção cobre a obra mais longa e o financiamento inteiro de quem for comprado hoje.
  const horizonte = nCotas > 0 ? Math.max(horizonteBase, planoCons.prazo) : horizonteBase

  const mesDoAnoDe = (m: number) => ((inicio.mes - 1 + m - 1) % 12) + 1
  const anoDe = (m: number) => dataDoMes(m, inicio).ano
  const precoDoMes = (m: number) => precoLancamento(m, p)
  const prontoDoMes = (m: number) => valorPronto(m, p)
  const fPesoTemporada = clamp(p.pctTemporada, 0, 100) / 100
  const montagemNoMes = (m: number) =>
    ((1 - fPesoTemporada) * p.custoMontagem + fPesoTemporada * p.custoMontagemTemporada) * fatorPreco(m, p.ipca)
  /** IPTU e condomínio integrais do dono, no período entre as chaves e o primeiro aluguel. */
  const custoParado = (valor: number) => (valor * (p.iptuPctAno + p.condominioPctAno)) / 100 / 12

  let caixa = 0
  let comprasDoMes = 0
  let docsDoMes = 0
  let montagemDoMes = 0
  let parcelasObraDoMes = 0
  let amortizacaoExtraDoMes = 0
  let vendasDoMes = 0
  let valorVendasDoMes = 0
  let entregasDaPlanta = 0
  let teveUnidade: boolean = false
  let unidades: Unidade[] = []
  const cotas: Cota[] = Array.from({ length: nCotas }, (_, j) => ({
    fracaoPaga: 0,
    contemplada: false,
    mesPlanejado: Math.min(planoCons.prazo, (j + 1) * Math.max(1, Math.round(p.consorcioIntervaloMeses))),
  }))

  const fatorContrato = (u: Unidade, m: number) => Math.pow(inccObraMensal, m - u.mesCompra)
  const valorDaParcela = (u: Unidade, par: Parcela) => (par.pct / 100) * u.precoContrato * fatorContrato(u, par.mes)

  /** Modo simples: paga parte do que falta até as chaves (separa imóvel de documentação). */
  const pagarRestante = (u: Unidade, valor: number) => {
    u.restante -= valor
    u.pago += valor * (1 - u.fracaoDocs)
    caixa -= valor
    comprasDoMes += valor * (1 - u.fracaoDocs)
    docsDoMes += valor * u.fracaoDocs
  }

  /** Modo contrato: paga uma parcela do cronograma. `obrigatoria` = estava no contrato (não é entrada de compra). */
  const pagarParcela = (u: Unidade, valor: number, obrigatoria: boolean) => {
    u.pago += valor
    caixa -= valor
    comprasDoMes += valor
    if (obrigatoria) parcelasObraDoMes += valor
  }

  /** O que ainda falta pagar da obra, valor de hoje (para adiantar) — sem documentação. */
  const devidoDaObra = (u: Unidade, mes: number): number => {
    if (!contrato) return Math.max(0, u.restante)
    let total = 0
    for (const par of u.parcelas) if (par.mes > mes) total += (par.pct / 100) * u.precoContrato * fatorContrato(u, mes)
    return total
  }

  /** Adianta até `valor` da obra: as parcelas mais próximas primeiro. Devolve o que de fato pagou. */
  const adiantar = (u: Unidade, valor: number, mes: number): number => {
    if (!contrato) {
      const v = Math.min(valor, Math.max(0, u.restante))
      if (v > 0) pagarRestante(u, v)
      return v
    }
    const porPonto = (u.precoContrato * fatorContrato(u, mes)) / 100 // R$ por ponto percentual, hoje
    let falta = valor
    let pago = 0
    u.parcelas.sort((a, b) => a.mes - b.mes)
    for (const par of u.parcelas) {
      if (falta <= 0.005 || par.mes <= mes) continue
      const pontos = Math.min(par.pct, falta / porPonto)
      const v = pontos * porPonto
      par.pct -= pontos
      falta -= v
      pago += v
      pagarParcela(u, v, false)
    }
    u.parcelas = u.parcelas.filter((par) => par.pct > 1e-9)
    return pago
  }

  /** Nas chaves o studio precisa de acabamento e mobília para alugar — gasto, não patrimônio. */
  const montarNasChaves = (u: Unidade, mes: number) => {
    if (mes !== u.mesPronto || u.montada) return
    const m = montagemNoMes(mes)
    caixa -= m
    montagemDoMes += m
    u.montada = true
  }

  /** Contrato: quita o que vence neste mês (parcelas, documentação e montagem nas chaves). */
  const quitarDoMes = (u: Unidade, mes: number) => {
    if (!contrato) return
    const restantes: Parcela[] = []
    for (const par of u.parcelas) {
      if (par.mes === mes) pagarParcela(u, valorDaParcela(u, par), mes !== u.mesCompra)
      else restantes.push(par)
    }
    u.parcelas = restantes
    if (mes === u.mesPronto && u.docsAPagar > 0) { caixa -= u.docsAPagar; docsDoMes += u.docsAPagar; u.docsAPagar = 0 }
    montarNasChaves(u, mes)
  }

  /** Studio pronto, à vista com desconto: `doFgts` abate o preço, o caixa completa, paga documentação e montagem. */
  const comprarPronta = (mes: number, precoMercado: number, doFgts: number) => {
    const precoPago = precoMercado * (1 - p.descontoAVista / 100)
    const m = montagemNoMes(mes)
    caixa -= precoPago - doFgts + precoPago * docs + m
    comprasDoMes += precoPago - doFgts
    docsDoMes += precoPago * docs
    montagemDoMes += m
    unidades.push({
      mesPronto: mes, mesAlugavel: mes + mesesAlug, pago: precoPago, valorNaEntrega: precoMercado, saldoFinanciado: 0,
      mesesRestantesFin: 0, restante: 0, fracaoDocs: 0, parcelas: [], precoContrato: 0, mesCompra: mes, docsAPagar: 0,
      montada: true, daPlanta: false,
    })
    teveUnidade = true
  }

  // "Já pago no 1º studio": uma unidade já contratada, em construção (ou já entregue). No contrato, as
  // parcelas mensais e anuais que a pessoa já paga nele (até as chaves) entram como parcelas de obra.
  if (p.initial > 0) {
    const parcelas1o: Parcela[] = []
    if (contrato && r1 > 0) {
      for (let k = 1; k <= r1; k++) {
        if (p.parcelaMensal1o > 0) parcelas1o.push({ mes: k, pct: (p.parcelaMensal1o / p.custoStudio) * 100 })
        if (p.parcelaAnual1o > 0 && k <= r1 && mesDoAnoDe(k) === p.annualMonth) parcelas1o.push({ mes: k, pct: (p.parcelaAnual1o / p.custoStudio) * 100 })
      }
    }
    const aindaAPagar1o = parcelas1o.reduce((a, par) => a + (par.pct / 100) * p.custoStudio * Math.pow(inccObraMensal, par.mes), 0)
    const saldoFinanciadoInicial = Math.max(0, (p.custoStudio - p.initial) * Math.pow(inccObraMensal, r1) - aindaAPagar1o)
    unidades.push({
      mesPronto: r1,
      mesAlugavel: r1 === 0 ? 0 : r1 + mesesAlug,
      pago: p.initial,
      valorNaEntrega: p.custoStudio * Math.pow(inccMensal, r1) * (1 + p.agioProntoPct / 100),
      saldoFinanciado: saldoFinanciadoInicial,
      mesesRestantesFin: prazoFin,
      restante: 0,
      fracaoDocs: 0,
      parcelas: parcelas1o,
      precoContrato: parcelas1o.length > 0 ? p.custoStudio : 0,
      mesCompra: 0,
      docsAPagar: 0,
      montada: r1 === 0,
      daPlanta: r1 > 0,
    })
    teveUnidade = true
  }

  let aporteMensal = p.monthlyAmount
  let aporteAnual = p.annualAmount
  let salario = p.salarioBrutoCasal
  let parcelaApe = p.parcelaApeAtual
  let saldoApe = p.dividaApe
  let fgtsSaldo = 0
  let extraDoApe = 0
  const sacApe = p.prazoApeMeses > 0 && p.dividaApe > 0
  const taxaApe = sacApe ? Math.max(0, p.parcelaApeAtual / p.dividaApe - 1 / p.prazoApeMeses) : 0
  let mesesRestantesApe = Math.round(p.prazoApeMeses)

  const custoFixoDeHoje = (mes: number) => p.custoFixoHoldingMes * fatorPreco(mes, p.ipca)

  /** O fluxo do dia da compra, para o cronograma automático dividir mensais e reforços. */
  const contextoDoCronograma = (mes: number): ContextoCronograma =>
    ({ mes, inicio, aporteMensal: aporteMensal + extraDoApe, aporteAnual, mesTransicao })

  /**
   * O que entra e sai do caixa mês a mês daqui pra frente (índice 0 = hoje), só com o que já é
   * conhecido e do jeito mais prudente: aportes de hoje até a transição (sem dissídio futuro), aluguel
   * de cada unidade congelado no valor de hoje, parcelas em SAC, o que cada obra ainda deve cobrado no
   * mês certo (já com a correção), e — no modo "vivo da renda" — a meta de retirada. O mínimo do
   * `caminho` é o dinheiro que pode ser gasto hoje sem fazer falta depois.
   */
  const projetar = (mes: number): Projecao => {
    const n = horizonte + 1
    const pontual = new Float64Array(n)
    const recorrente = new Float64Array(n)
    const meta = new Float64Array(n)
    const saidas = new Float64Array(n)
    const caminho = new Float64Array(n)
    const anoPior = anoDe(mes + horizonte)

    for (let k = 1; k <= horizonte; k++) {
      const m = mes + k
      if (m > mesTransicao) break
      pontual[k] += aporteMensal + extraDoApe
      if (mesDoAnoDe(m) === p.annualMonth) pontual[k] += aporteAnual
    }
    if (vive && saldoApe > 0) {
      for (let k = 1; k <= horizonte; k++) {
        if (mes + k <= mesTransicao) continue
        if (sacApe && k > mesesRestantesApe) break
        recorrente[k] -= parcelaApe
        saidas[k] += parcelaApe
      }
    }
    if (teveUnidade && p.custoFixoHoldingMes > 0) {
      const c = custoFixoDeHoje(mes)
      for (let k = 1; k <= horizonte; k++) { recorrente[k] -= c; saidas[k] += c }
    }

    for (const u of unidades) {
      const valor = mes >= u.mesPronto ? valorAtual(u, mes, valorizacaoLiquidaAnual) : u.valorNaEntrega
      const aluguel = rendaDaUnidade(valor, mes, anoPior, p).liquido
      const parado = custoParado(valor)
      const kPronto = Math.max(1, u.mesPronto - mes)
      const kAlug = Math.max(1, u.mesAlugavel - mes)
      let saldo = u.saldoFinanciado
      let resta = u.mesesRestantesFin
      for (let k = kPronto; k <= horizonte; k++) {
        if (k >= kAlug) recorrente[k] += aluguel
        else { recorrente[k] -= parado; saidas[k] += parado }
        if (saldo > 0) {
          const x = parcelaSac(saldo, resta, jurosFin, correcaoPos)
          recorrente[k] -= x.parcela
          saidas[k] += x.parcela
          saldo = x.saldoDepois
          resta--
        }
      }
      if (contrato) {
        for (const par of u.parcelas) {
          const k = par.mes - mes
          if (k < 1 || k > horizonte) continue
          const v = valorDaParcela(u, par)
          pontual[k] -= v
          saidas[k] += v
        }
        const kc = u.mesPronto - mes
        if (u.docsAPagar > 0 && kc >= 1 && kc <= horizonte) pontual[kc] -= u.docsAPagar
      } else {
        const k = u.mesPronto - mes
        if (u.restante > 0 && k > 0 && k <= horizonte) pontual[k] -= u.restante * Math.pow(inccObraMensal, k)
      }
      const kMont = u.mesPronto - mes
      if (!u.montada && kMont >= 1 && kMont <= horizonte) pontual[kMont] -= montagemNoMes(u.mesPronto)
    }

    // Consórcio: parcelas das cotas e, para as que ainda não saíram, o lance e a compra no mês planejado.
    for (const cota of cotas) {
      const restantes = Math.ceil((1 - cota.fracaoPaga) * planoCons.prazo - 1e-9)
      for (let k = 1; k <= Math.min(restantes, horizonte); k++) {
        const v = (1 / planoCons.prazo) * carta(mes + k, p) * (1 + taxaCons(p))
        recorrente[k] -= v
        saidas[k] += v
      }
      const kc = cota.mesPlanejado - mes
      if (!cota.contemplada && kc >= 1 && kc <= horizonte) {
        const cm = carta(cota.mesPlanejado, p)
        const preco = prontoDoMes(cota.mesPlanejado) * (1 - p.descontoAVista / 100)
        const lance = cota.mesPlanejado >= planoCons.prazo ? 0 : Math.min((p.consorcioLancePct / 100) * cm, (1 - cota.fracaoPaga) * cm * (1 + taxaCons(p)))
        pontual[kc] -= lance + Math.max(0, preco - cm) + preco * docs + montagemNoMes(cota.mesPlanejado)
        const renda = rendaDaUnidade(prontoDoMes(mes), mes, anoPior, p).liquido
        for (let k = kc + mesesAlug + 1; k <= horizonte; k++) recorrente[k] += renda
      }
    }

    const metaHoje = p.metaRendaHoje * fatorPreco(mes, p.ipca)
    let s = caixa
    for (let k = 0; k <= horizonte; k++) {
      meta[k] = vive && k > 0 && mes + k > mesTransicao ? metaHoje : 0
      const retirada = meta[k] > 0 ? Math.min(meta[k], Math.max(0, recorrente[k])) : 0
      s += pontual[k] + recorrente[k] - retirada
      caminho[k] = s
    }
    return { pontual, recorrente, meta, saidas, caminho }
  }

  const minimo = (a: Float64Array) => a.reduce((x, y) => Math.min(x, y), Infinity)
  const obrigacaoMedia = (saidas: Float64Array, extra?: Float64Array): number => {
    let soma = 0
    let n = 0
    for (let k = 1; k <= 12 && k < saidas.length; k++) { soma += saidas[k] + (extra ? extra[k] : 0); n++ }
    return n === 0 ? 0 : soma / n
  }
  const reservaDe = (proj: Projecao, extra?: Float64Array) => p.reservaMeses * obrigacaoMedia(proj.saidas, extra)
  /** O dinheiro que pode sair hoje: o mínimo do caminho menos a reserva mínima. */
  const folgaLivre = (mes: number) => { const pr = projetar(mes); return minimo(pr.caminho) - reservaDe(pr) }

  const efP = new Float64Array(horizonte + 1)
  const efR = new Float64Array(horizonte + 1)
  const efS = new Float64Array(horizonte + 1)

  /** O caminho continua dentro da reserva comprando hoje um studio que entrega em `r` meses? */
  const cabeNaObra = (proj: Projecao, r: number, mes: number): boolean => {
    efP.fill(0); efR.fill(0); efS.fill(0)
    const P = precoNaObra(mes, r, prazoObra, p)
    const valor = prontoDoMes(mes) * Math.pow(inccMensal, r)
    const anoPior = anoDe(mes + horizonte)
    const aluguel = rendaDaUnidade(valor, mes, anoPior, p).liquido
    const parado = custoParado(valor)
    let saldo = P * (1 - pctChaves) * Math.pow(inccObraMensal, r)
    let resta = prazoFin
    if (contrato) {
      for (const par of cronograma(r, p, contextoDoCronograma(mes))) {
        const v = (par.pct / 100) * P * Math.pow(inccObraMensal, par.k)
        efP[par.k] -= v
        if (par.k >= 1) efS[par.k] += v
      }
      efP[r] -= docs * P
    } else {
      efP[r] -= (pctChaves + docs) * P * Math.pow(inccObraMensal, r)
    }
    efP[r] -= montagemNoMes(mes + r)
    if (!teveUnidade && p.custoFixoHoldingMes > 0) {
      const c = custoFixoDeHoje(mes)
      for (let k = 1; k <= horizonte; k++) { efR[k] -= c; efS[k] += c }
    }
    for (let k = r + 1; k <= horizonte; k++) {
      if (k > r + mesesAlug) efR[k] += aluguel
      else { efR[k] -= parado; efS[k] += parado }
      if (saldo > 0) {
        const x = parcelaSac(saldo, resta, jurosFin, correcaoPos)
        efR[k] -= x.parcela
        efS[k] += x.parcela
        saldo = x.saldoDepois
        resta--
      }
    }
    const reserva = reservaDe(proj, efS)
    let s = caixa
    for (let k = 0; k <= horizonte; k++) {
      const rec = proj.recorrente[k] + efR[k]
      if (proj.meta[k] > 0) {
        const sem = Math.min(proj.meta[k], Math.max(0, proj.recorrente[k]))
        const com = Math.min(proj.meta[k], Math.max(0, rec))
        if (com < sem - 0.01) return false // não se compra studio com o dinheiro de viver
        s += proj.pontual[k] + efP[k] + rec - com
      } else {
        s += proj.pontual[k] + efP[k] + rec
      }
      if (s < reserva - 0.01) return false
    }
    return true
  }

  const novaNaObra = (mes: number, r: number): Unidade => {
    const P = precoNaObra(mes, r, prazoObra, p)
    return {
      mesPronto: mes + r,
      mesAlugavel: mes + r + mesesAlug,
      pago: 0,
      valorNaEntrega: prontoDoMes(mes) * Math.pow(inccMensal, r),
      saldoFinanciado: P * (1 - pctChaves) * Math.pow(inccObraMensal, r),
      mesesRestantesFin: prazoFin,
      restante: contrato ? 0 : (pctChaves + docs) * P,
      fracaoDocs: contrato ? 0 : docs / (pctChaves + docs),
      parcelas: contrato ? cronograma(r, p, contextoDoCronograma(mes)).map((par) => ({ mes: mes + par.k, pct: par.pct })) : [],
      precoContrato: P,
      mesCompra: mes,
      docsAPagar: contrato ? docs * P : 0,
      montada: false,
      daPlanta: r > 0,
    }
  }

  /** Registra uma compra do planejador/venda: no contrato paga já a entrada (e tudo, se pronta). */
  const registrar = (nova: Unidade, mes: number, r: number) => {
    unidades.push(nova)
    teveUnidade = true
    if (contrato) quitarDoMes(nova, mes)
    else if (r === 0) { pagarRestante(nova, nova.restante); montarNasChaves(nova, mes) }
  }

  const linhas: MonthRow[] = []

  for (let mes = 1; mes <= meses; mes++) {
    comprasDoMes = 0
    docsDoMes = 0
    montagemDoMes = 0
    parcelasObraDoMes = 0
    amortizacaoExtraDoMes = 0
    vendasDoMes = 0
    valorVendasDoMes = 0
    const dataMes = dataDoMes(mes, inicio)
    const transicionou = mes > mesTransicao
    const semTrabalho = vive && transicionou

    // Rendimento do caixa parado (nunca sobre saldo negativo).
    const rendimentoDoMes = Math.max(0, caixa) * rendimentoCaixaMensal
    caixa += rendimentoDoMes

    if (!transicionou && dataMes.mesDoAno === p.mesDissidio) {
      aporteMensal *= 1 + p.dissidio / 100
      aporteAnual *= 1 + p.dissidio / 100
      salario *= 1 + p.dissidio / 100
    }

    // FGTS: rende todo mês e recebe o depósito patronal — o do 13º soma em dezembro. Sem trabalho, sem depósito.
    fgtsSaldo *= 1 + fgtsRendimentoMensal
    if (!semTrabalho) {
      fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)
      if (dataMes.mesDoAno === MES_DO_13O) fgtsSaldo += salario * (FGTS_DEPOSITO_PCT / 100)
    }

    // Apê em SAC: a parcela deste mês amortiza um pedaço do saldo.
    let parcelaApeDoMes = parcelaApe
    if (sacApe) {
      if (saldoApe > 0) {
        const amortizacao = mesesRestantesApe > 1 ? saldoApe / mesesRestantesApe : saldoApe
        parcelaApe = amortizacao + saldoApe * taxaApe
        parcelaApeDoMes = parcelaApe
        saldoApe -= amortizacao
        if (saldoApe < 0.5) saldoApe = 0
        mesesRestantesApe = Math.max(0, mesesRestantesApe - 1)
      } else {
        parcelaApe = 0
        parcelaApeDoMes = 0
      }
    }
    const apeTinhaSaldo = parcelaApeDoMes > 0 || (!sacApe && saldoApe > 0)

    // Com saldo devedor no apê, a cada 2 anos o FGTS abate o apê. No modo antigo a parcela cai na
    // mesma proporção do saldo (prazo mantido) e a queda vira aporte; em SAC a parcela já cai sozinha.
    let abatimentoApeDoMes = 0
    if (saldoApe > 0 && mes % MESES_POR_SAQUE_FGTS === 0) {
      const abatimento = Math.min(fgtsSaldo, saldoApe)
      if (abatimento > 0) {
        const saldoNovo = saldoApe - abatimento
        if (!sacApe) {
          const parcelaNova = parcelaApe * (saldoNovo / saldoApe)
          extraDoApe += parcelaApe - parcelaNova
          parcelaApe = parcelaNova
        }
        saldoApe = sacApe && saldoNovo < 0.5 ? 0 : saldoNovo
        fgtsSaldo -= abatimento
        abatimentoApeDoMes = abatimento
      }
    }
    if (sacApe) extraDoApe = Math.max(0, p.parcelaApeAtual - parcelaApe)

    let aporteDoMes = 0
    let aporteAnualDoMes = 0
    if (!transicionou) {
      aporteDoMes = aporteMensal + extraDoApe
      if (dataMes.mesDoAno === p.annualMonth) aporteAnualDoMes = aporteAnual
    }
    caixa += aporteDoMes + aporteAnualDoMes

    // Consórcio: a parcela de cada cota sai todo mês, até o plano acabar.
    let parcelasConsorcioDoMes = 0
    let lanceConsorcioDoMes = 0
    let contemplacoesDoMes = 0
    let comprasLeilaoDoMes = 0
    let arrematesDoMes = 0
    for (const cota of cotas) {
      if (cota.fracaoPaga >= 1) continue
      const fracao = Math.min(1 / planoCons.prazo, 1 - cota.fracaoPaga)
      const parcela = fracao * carta(mes, p) * (1 + taxaCons(p))
      caixa -= parcela
      cota.fracaoPaga += fracao
      parcelasConsorcioDoMes += parcela
    }

    // Obra. Modo simples: o que falta é corrigido e, nas chaves, quita o que restar. Modo contrato:
    // paga o que vence no mês; nas chaves, vende a unidade se a estratégia pedir.
    for (let i = unidades.length - 1; i >= 0; i--) {
      const u = unidades[i]
      if (contrato) {
        if (u.daPlanta && mes === u.mesPronto && p.pctVendaNasChaves > 0) {
          entregasDaPlanta++
          if (vendeNasChaves(entregasDaPlanta, p.pctVendaNasChaves)) {
            const devido = u.parcelas.reduce((a, par) => a + valorDaParcela(u, par), 0)
            const liquido = liquidoVendaNasChaves(u.valorNaEntrega, devido, u.saldoFinanciado, p)
            if (liquido > 0) {
              unidades.splice(i, 1)
              caixa += liquido
              vendasDoMes++
              valorVendasDoMes += liquido
              continue
            }
          }
        }
        quitarDoMes(u, mes)
      } else {
        if (u.restante > 0) {
          u.restante *= inccObraMensal
          if (mes >= u.mesPronto) pagarRestante(u, u.restante)
        }
        montarNasChaves(u, mes)
      }
    }

    // Aluguel das unidades prontas e parcela das que ainda devem.
    if (unidades.length > 0) teveUnidade = true
    let recebidoDoMes = 0
    let custosDoMes = 0
    let parcelasDoMes = 0
    for (const u of unidades) {
      if (mes < u.mesPronto) continue
      const valor = valorAtual(u, mes, valorizacaoLiquidaAnual)
      if (mes >= u.mesAlugavel) {
        const conta = rendaDaUnidade(valor, mes, dataMes.ano, p)
        recebidoDoMes += conta.liquido + conta.custos
        custosDoMes += conta.custos
      } else {
        custosDoMes += custoParado(valor)
      }
      if (u.saldoFinanciado > 0) {
        const x = parcelaSac(u.saldoFinanciado, u.mesesRestantesFin, jurosFin, correcaoPos)
        parcelasDoMes += x.parcela
        u.saldoFinanciado = x.saldoDepois
        u.mesesRestantesFin = Math.max(0, u.mesesRestantesFin - 1)
      }
    }
    caixa += recebidoDoMes - custosDoMes - parcelasDoMes

    // Custo fixo da holding, parcela do apê (quando a pessoa já não trabalha) e a retirada para viver.
    const custoFixoDoMes = teveUnidade ? custoFixoDeHoje(mes) : 0
    caixa -= custoFixoDoMes
    const parcelaApePagaDoMes = semTrabalho && apeTinhaSaldo ? parcelaApeDoMes : 0
    caixa -= parcelaApePagaDoMes
    const metaDoMes = p.metaRendaHoje * fatorPreco(mes, p.ipca)
    const disponivel = recebidoDoMes - custosDoMes - parcelasDoMes - parcelaApePagaDoMes - custoFixoDoMes - parcelasConsorcioDoMes
    const retiradaDoMes = semTrabalho ? Math.min(metaDoMes, Math.max(0, disponivel)) : 0
    caixa -= retiradaDoMes

    const precoLanc = precoDoMes(mes)
    const prontoMes = prontoDoMes(mes)
    const precoPronto = prontoMes * (1 - p.descontoAVista / 100)

    // Venda: uma vez por ano, unidade a unidade — só as prontas e quitadas.
    if (mesDoAnoDe(mes) === MES_AVALIA_VENDA) {
      const custoPronto = precoPronto * (1 + docs) + montagemNoMes(mes)
      const fatorObra = Math.pow(inccMensal, prazoObra)
      const fatorCorr = Math.pow(inccObraMensal, prazoObra)
      for (let i = unidades.length - 1; i >= 0; i--) {
        const u = unidades[i]
        if (mes < u.mesPronto || u.saldoFinanciado > 0) continue
        const decisao = avaliaVenda(
          valorAtual(u, mes, valorizacaoLiquidaAnual), precoLanc, prontoMes, custoPronto, pctChaves, docs,
          fatorObra, fatorCorr, prazoObra, montagemNoMes(mes + prazoObra), mes, dataMes.ano, p,
        )
        if (!decisao) continue
        // Vende de mentira primeiro: só vale se o dinheiro conseguir virar outro studio
        // sem estourar o caixa lá na frente — senão a unidade fica onde está.
        unidades.splice(i, 1)
        caixa += decisao.liquido
        const reaplica = decisao.destino === 'pronto'
          ? folgaLivre(mes) >= custoPronto
          : cabeNaObra(projetar(mes), prazoObra, mes)
        if (!reaplica) {
          caixa -= decisao.liquido
          unidades.splice(i, 0, u)
          continue
        }
        vendasDoMes++
        valorVendasDoMes += decisao.liquido
        if (decisao.destino === 'pronto') {
          for (let n = 0; n < MAX_COMPRAS_POR_MES && folgaLivre(mes) >= custoPronto; n++) comprarPronta(mes, prontoMes, 0)
        } else {
          // lançamentos (obra inteira pela frente): é onde está o ganho que justificou a venda
          const teto = Math.floor(decisao.liquido / ((pctChaves + docs) * precoLanc))
          for (let n = 0; n < teto && cabeNaObra(projetar(mes), prazoObra, mes); n++) {
            registrar(novaNaObra(mes, prazoObra), mes, prazoObra)
          }
        }
      }
    }

    // FGTS: com o apê quitado, compra studio pronto assim que FGTS + caixa livre fecham a conta.
    let compraAVistaFgtsDoMes = 0
    for (let n = 0; saldoApe <= 0 && fgtsSaldo > 0 && n < MAX_COMPRAS_POR_MES; n++) {
      const doFgts = Math.min(fgtsSaldo, precoPronto)
      if (precoPronto - doFgts + precoPronto * docs + montagemNoMes(mes) > Math.max(0, folgaLivre(mes))) break
      comprarPronta(mes, prontoMes, doFgts)
      fgtsSaldo -= doFgts
      compraAVistaFgtsDoMes += doFgts
    }

    // Consórcio: contempla as cotas no mês que a pessoa supôs (ou quando o caixa deixar). Testa "como se
    // já tivesse acontecido" — a projeção do planejador já conta o aluguel desse studio — e desfaz se não couber.
    for (const cota of cotas) {
      if (cota.contemplada || mes < cota.mesPlanejado) continue
      const cm = carta(mes, p)
      const lance = mes >= planoCons.prazo ? 0 : Math.min((p.consorcioLancePct / 100) * cm, (1 - cota.fracaoPaga) * cm * (1 + taxaCons(p)))
      const precoPago = precoPronto
      const complemento = Math.max(0, precoPago - cm)
      const mont = montagemNoMes(mes)
      const custoNoCaixa = lance + complemento + precoPago * docs + mont
      const fracaoAntes = cota.fracaoPaga
      const nova: Unidade = {
        mesPronto: mes, mesAlugavel: mes + mesesAlug, pago: precoPago, valorNaEntrega: prontoMes, saldoFinanciado: 0,
        mesesRestantesFin: 0, restante: 0, fracaoDocs: 0, parcelas: [], precoContrato: 0, mesCompra: mes, docsAPagar: 0,
        montada: true, daPlanta: false,
      }
      const tinhaUnidade: boolean = teveUnidade
      caixa -= custoNoCaixa
      cota.contemplada = true
      cota.fracaoPaga = Math.min(1, fracaoAntes + (lance + Math.max(0, cm - precoPago)) / (cm * (1 + taxaCons(p))))
      unidades.push(nova)
      teveUnidade = true
      if (folgaLivre(mes) < -0.01) {
        unidades.pop()
        teveUnidade = tinhaUnidade
        cota.contemplada = false
        cota.fracaoPaga = fracaoAntes
        caixa += custoNoCaixa
        continue
      }
      lanceConsorcioDoMes += lance
      comprasDoMes += complemento
      docsDoMes += precoPago * docs
      montagemDoMes += mont
      contemplacoesDoMes++
    }

    // Leilão: studio pronto abaixo do mercado, pago à vista. Sozinho compra sempre que couber; com a planta
    // ativa (mix) só entra se o ganho imediato passar do limiar — senão a planta rende mais por real.
    if (p.leilaoAtivo) {
      const arremate = prontoMes * (1 - p.leilaoDescontoPct / 100)
      const custoSemMontagem = arremate * (1 + (p.leilaoComissaoPct + p.leilaoJuridicoPct) / 100 + docs) + prontoMes * (p.leilaoReformaPct / 100)
      const ganho = arremate > 0 ? prontoMes / (custoSemMontagem - arremate * docs) - 1 : 0
      const limiar = p.compraNaPlanta === false ? 0 : (p.leilaoLimiarPct ?? 0) / 100
      const custoTotal = custoSemMontagem + montagemNoMes(mes)
      const mesesAlugL = Math.round(clamp(p.leilaoMesesAteAlugar, 0, 36))
      for (let n = 0; ganho >= limiar - 1e-12 && n < MAX_COMPRAS_POR_MES && custoTotal <= caixa && custoTotal <= Math.max(0, folgaLivre(mes)); n++) {
        caixa -= custoTotal
        const gasto = arremate * (1 + (p.leilaoComissaoPct + p.leilaoJuridicoPct) / 100) + prontoMes * (p.leilaoReformaPct / 100)
        comprasDoMes += gasto
        comprasLeilaoDoMes += gasto
        docsDoMes += arremate * docs
        montagemDoMes += montagemNoMes(mes)
        arrematesDoMes++
        unidades.push({
          mesPronto: mes, mesAlugavel: mes + mesesAlugL, pago: gasto, valorNaEntrega: prontoMes, saldoFinanciado: 0,
          mesesRestantesFin: 0, restante: 0, fracaoDocs: 0, parcelas: [], precoContrato: 0, mesCompra: mes, docsAPagar: 0,
          montada: true, daPlanta: false,
        })
        teveUnidade = true
      }
    }

    // Mix: se o leilão compensa e o caixa chega nele em poucos meses, vale esperar em vez de gastar o
    // dinheiro em parcelas de planta que adiariam o arremate (o ganho imediato do leilão é o maior da mesa).
    let esperaOLeilao = false
    if (p.leilaoAtivo && p.compraNaPlanta !== false && (p.leilaoEsperaMeses ?? 0) > 0) {
      const arremate = prontoMes * (1 - p.leilaoDescontoPct / 100)
      const custoBase = arremate * (1 + (p.leilaoComissaoPct + p.leilaoJuridicoPct) / 100) + prontoMes * (p.leilaoReformaPct / 100)
      const ganho = arremate > 0 ? prontoMes / custoBase - 1 : 0
      if (ganho >= (p.leilaoLimiarPct ?? 0) / 100 - 1e-12) {
        const custoTotal = custoBase + arremate * docs + montagemNoMes(mes)
        const pr = projetar(mes)
        const reserva = reservaDe(pr)
        const janela = Math.min(Math.round(p.leilaoEsperaMeses ?? 0), horizonte)
        let pisoDaquiPraFrente = Infinity
        for (let k = horizonte; k >= 1; k--) {
          pisoDaquiPraFrente = Math.min(pisoDaquiPraFrente, pr.caminho[k])
          if (k <= janela && pisoDaquiPraFrente - reserva >= custoTotal) { esperaOLeilao = true; break }
        }
      }
    }

    // Planejador: compra o studio com menos obra pela frente que o caixa projetado paga.
    for (let n = 0; p.compraNaPlanta !== false && !esperaOLeilao && n < MAX_COMPRAS_POR_MES; n++) {
      const proj = projetar(mes)
      let r = 0
      while (r <= prazoObra && !cabeNaObra(proj, r, mes)) r++
      if (r > prazoObra) break
      registrar(novaNaObra(mes, r), mes, r)
    }

    // Destino da sobra: onde ela rende mais — adiantar a obra, quitar financiamento ou ficar no caixa.
    let livre = folgaLivre(mes)
    const taxaObra = (Math.pow(inccObraMensal, 12) - 1) * 100
    const taxaFin = contrato ? (Math.pow(1 + correcaoPos, 12) - 1) * 100 : (Math.pow(1 + jurosFin, 12) - 1) * 100
    const destinos: ('obra' | 'financiamento')[] = p.sobraDoCaixa === 'adianta_obra'
      ? ['obra']
      : ([['obra', taxaObra], ['financiamento', taxaFin]] as const)
        .filter(([, taxa]) => taxa > p.rendimentoCaixaAno + 1e-9)
        .sort((a, b) => b[1] - a[1])
        .map(([d]) => d)
    for (const destino of destinos) {
      if (livre <= 0.01) break
      if (destino === 'obra') {
        for (const u of [...unidades].sort((a, b) => a.mesPronto - b.mesPronto)) {
          if (livre <= 0.01) break
          livre -= adiantar(u, livre, mes)
        }
      } else {
        for (const u of unidades.filter((x) => mes >= x.mesPronto && x.saldoFinanciado > 0).sort((a, b) => a.saldoFinanciado - b.saldoFinanciado)) {
          if (livre <= 0.01) break
          const v = Math.min(livre, u.saldoFinanciado)
          u.saldoFinanciado -= v
          if (u.saldoFinanciado < 0.5) { u.saldoFinanciado = 0; u.mesesRestantesFin = 0 }
          caixa -= v
          amortizacaoExtraDoMes += v
          livre -= v
        }
      }
    }

    let imoveisEmConstrucao = 0
    let imoveisAlugados = 0
    let imoveisQuitados = 0
    let imoveisFinanciados = 0
    let patrimonioLiquido = caixa
    let valorImoveis = 0
    let dividaFinanciamento = 0
    let aPagarObra = 0
    for (const u of unidades) {
      if (mes < u.mesPronto) {
        imoveisEmConstrucao++
        patrimonioLiquido += u.pago
        aPagarObra += devidoDaObra(u, mes) + u.saldoFinanciado
        continue
      }
      imoveisAlugados++
      if (u.saldoFinanciado > 0) imoveisFinanciados++
      else imoveisQuitados++
      const v = valorAtual(u, mes, valorizacaoLiquidaAnual)
      valorImoveis += v
      dividaFinanciamento += u.saldoFinanciado
      patrimonioLiquido += v - u.saldoFinanciado
    }
    let dividaConsorcio = 0
    let contemplacoesAtrasadas = 0
    for (const cota of cotas) {
      if (cota.contemplada) patrimonioLiquido -= (1 - cota.fracaoPaga) * carta(mes, p)
      else patrimonioLiquido += cota.fracaoPaga * carta(mes, p)
      dividaConsorcio += (1 - cota.fracaoPaga) * carta(mes, p) * (1 + taxaCons(p))
      if (!cota.contemplada && mes > cota.mesPlanejado) contemplacoesAtrasadas++
    }
    const obrigacoesMes = parcelasDoMes + parcelasObraDoMes + parcelaApePagaDoMes + custoFixoDoMes + parcelasConsorcioDoMes

    linhas.push({
      mes,
      anoDoPlano: Math.ceil(mes / 12),
      ano: dataMes.ano,
      mesDoAno: dataMes.mesDoAno,
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
      metaDoMes: Math.round(metaDoMes),
      rendaDisponivel: Math.round(disponivel),
      retirada: Math.round(retiradaDoMes),
      parcelaApePaga: Math.round(parcelaApePagaDoMes),
      saldoApe: Math.round(saldoApe),
      parcelaApe: Math.round(parcelaApeDoMes),
      montagem: Math.round(montagemDoMes),
      rendimentoCaixa: Math.round(rendimentoDoMes),
      custoFixoHolding: Math.round(custoFixoDoMes),
      amortizacaoExtra: Math.round(amortizacaoExtraDoMes),
      dividaFinanciamento: Math.round(dividaFinanciamento),
      aPagarObra: Math.round(aPagarObra),
      valorImoveis: Math.round(valorImoveis),
      parcelasObra: Math.round(parcelasObraDoMes),
      obrigacoesMes: Math.round(obrigacoesMes),
      parcelasConsorcio: Math.round(parcelasConsorcioDoMes),
      lanceConsorcio: Math.round(lanceConsorcioDoMes),
      contemplacoes: contemplacoesDoMes,
      contemplacoesAtrasadas,
      dividaConsorcio: Math.round(dividaConsorcio),
      comprasLeilao: Math.round(comprasLeilaoDoMes),
      arremates: arrematesDoMes,
    })
  }

  return linhas
}

/**
 * Vale vender uma unidade que vale `valor` hoje? Compara, num horizonte de UM tempo de obra (o
 * "3 anos de aluguel" contra "um studio que fica pronto em 3 anos"), três caminhos — devolve
 * `null` para manter:
 *
 * - MANTER: o valor dela no fim do horizonte + o aluguel líquido do período.
 * - PLANTA: o líquido da venda (sem corretagem e imposto) vira entrada + documentação de studios
 *   na planta; no fim da obra o equity é o valor do pronto menos o saldo a financiar (e a montagem).
 * - PRONTO: o líquido compra studio pronto à vista com desconto (+ documentação e montagem), que
 *   valoriza e aluga desde já — o "vender caro e comprar mais barato".
 *
 * Conta contínua (fração de unidade) para a COMPARAÇÃO; a execução compra só unidades inteiras e o
 * resto vai pro caixa.
 */
function avaliaVenda(
  valor: number, lancamento: number, precoPronto: number, custoPronto: number, pctChaves: number, docs: number,
  fatorObra: number, fatorCorr: number, horizonte: number, montagemEntrega: number, mes: number, ano: number, p: PlannerParams,
): { liquido: number; destino: 'planta' | 'pronto' } | null {
  const crescimento = Math.pow(1 + (p.incc - p.depreciacao) / 100, horizonte / 12)
  const aluguelNoPeriodo = (v: number) =>
    rendaDaUnidade(v * Math.sqrt(crescimento), mes, ano, p).liquido * Math.max(0, horizonte - Math.round(clamp(p.mesesAteAlugar, 0, 12)))

  const manter = valor * crescimento + aluguelNoPeriodo(valor)
  const liquido = valor * (1 - (p.corretagemVendaPct + p.impostoVendaPct) / 100)
  const equityNaEntrega = lancamento * (1 + p.agioProntoPct / 100) * fatorObra - lancamento * (1 - pctChaves) * fatorCorr - montagemEntrega
  const planta = (liquido / ((pctChaves + docs) * lancamento)) * equityNaEntrega
  const pronto = (liquido / custoPronto) * (precoPronto * crescimento + aluguelNoPeriodo(precoPronto))

  if (Math.max(planta, pronto) <= manter * (1 + FOLGA_VENDA)) return null
  return { liquido, destino: pronto >= planta ? 'pronto' : 'planta' }
}

export function simulate(p: PlannerParams, inicio: Inicio = INICIO_PADRAO): YearPoint[] {
  return pontosAnuais(simulateMonthly(p, inicio), p)
}

/** Os pontos do gráfico, derivados de um diário já calculado — a tela não simula duas vezes. */
export function pontosAnuais(linhas: MonthRow[], p: PlannerParams): YearPoint[] {
  const pontos: YearPoint[] = [{
    ano: 0,
    anoCalendario: linhas[0]?.ano ?? 0,
    patrimonioLiquido: Math.round(p.initial),
    precoStudioNovo: Math.round(p.custoStudio),
    studiosComChaves: 0,
    studiosQuitadosEquiv: 0,
    rendaMensalLiquida: 0,
    divida: 0,
  }]
  for (const linha of linhas) {
    if (linha.mes % 12 !== 0) continue
    const ano = linha.mes / 12
    pontos.push({
      ano,
      anoCalendario: linha.ano,
      patrimonioLiquido: linha.patrimonioLiquido,
      precoStudioNovo: Math.round(p.custoStudio * Math.pow(1 + p.incc / 100, ano)),
      studiosComChaves: linha.imoveisAlugados,
      studiosQuitadosEquiv: linha.imoveisQuitados,
      rendaMensalLiquida: linha.rendaMensalLiquida,
      divida: linha.dividaFinanciamento + linha.aPagarObra + linha.dividaConsorcio,
    })
  }
  return pontos
}
