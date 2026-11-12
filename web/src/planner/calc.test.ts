import { describe, expect, it } from 'vitest'
import { simulate, simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

// Custos novos zerados: os testes de mecânica (obra, financiamento, FGTS) medem a mecânica,
// não a soma de taxas. Cada custo tem o próprio bloco de testes mais abaixo.
const SEM_CUSTOS: Partial<PlannerParams> = {
  vacanciaMesesAno: 0, iptuPctAno: 0, condominioPctAno: 0, taxaAdmPct: 0, manutencaoPctAno: 0,
  itbiPct: 0, escrituraPct: 0, registroPct: 0, descontoAVista: 0,
}
const base = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...SEM_CUSTOS, ...over })

describe('simulate — motor puro do simulador de studios', () => {
  it('devolve um ponto por ano, do ano 0 ao horizonte', () => {
    const r = simulate(base({ years: 5 }))
    expect(r.map((p) => p.ano)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('o ano 0 é exatamente o que já foi pago', () => {
    const r = simulate(base({ initial: 123_000 }))
    expect(r[0].patrimonioLiquido).toBe(123_000)
  })

  it('sem aporte e sem rendimento, o patrimônio não sai do lugar (conservação: pagar a própria dívida não cria nem destrói patrimônio)', () => {
    const r = simulate(base({
      initial: 50_000, monthlyAmount: 0, annualAmount: 0, dissidio: 0, rate: 0, incc: 0, depreciacao: 0,
      jurosFinHolding: 0, pctPagoChaves: 100, dividaApe: 0, salarioBrutoCasal: 0,
      anoTransicao: 0,
    }))
    expect(r.every((p) => p.patrimonioLiquido === 50_000)).toBe(true)
  })

  it('mais aporte mensal sempre deixa MAIS patrimônio no fim', () => {
    const baixo = simulate(base({ monthlyAmount: 5_000 })).at(-1)!
    const alto = simulate(base({ monthlyAmount: 15_000 })).at(-1)!
    expect(alto.patrimonioLiquido).toBeGreaterThan(baixo.patrimonioLiquido)
  })

  it('mais aporte anual (bônus) sempre deixa MAIS patrimônio no fim', () => {
    const baixo = simulate(base({ annualAmount: 20_000 })).at(-1)!
    const alto = simulate(base({ annualAmount: 150_000 })).at(-1)!
    expect(alto.patrimonioLiquido).toBeGreaterThan(baixo.patrimonioLiquido)
  })

  it('aporte anual mais cedo no ano rende mais no fim do plano do que mais tarde', () => {
    const cedo = simulate(base({ annualMonth: 1 })).at(-1)!
    const tarde = simulate(base({ annualMonth: 12 })).at(-1)!
    expect(cedo.patrimonioLiquido).toBeGreaterThan(tarde.patrimonioLiquido)
  })

  it('dissídio mais cedo no ano rende mais no fim do plano do que mais tarde', () => {
    const cedo = simulate(base({ mesDissidio: 1, dissidio: 20 })).at(-1)!
    const tarde = simulate(base({ mesDissidio: 12, dissidio: 20 })).at(-1)!
    expect(cedo.patrimonioLiquido).toBeGreaterThan(tarde.patrimonioLiquido)
  })

  it('pagar uma fatia menor nas chaves (mais alavancagem) rende mais patrimônio no fim, quando o aluguel + valorização superam o custo da dívida', () => {
    const semAlavancar = simulate(base({ pctPagoChaves: 100 })).at(-1)!
    const alavancado = simulate(base({ pctPagoChaves: 50 })).at(-1)!
    expect(alavancado.patrimonioLiquido).toBeGreaterThan(semAlavancar.patrimonioLiquido)
  })

  it('pctPagoChaves tem piso de 10% — abaixo disso o resultado é idêntico a 10%', () => {
    const comZero = simulate(base({ pctPagoChaves: 0 }))
    const comPiso = simulate(base({ pctPagoChaves: 10 }))
    expect(comZero).toEqual(comPiso)
  })

  it('parar de aportar no ano de transição trava o patrimônio em relação a quem segue aportando', () => {
    const para = simulate(base({ anoTransicao: 5, years: 15 })).at(-1)!
    const segue = simulate(base({ anoTransicao: 15, years: 15 })).at(-1)!
    expect(para.patrimonioLiquido).toBeLessThan(segue.patrimonioLiquido)
  })

  it('depois do ano de transição, a carteira ainda cresce sozinha (reinveste os aluguéis)', () => {
    const r = simulate(base({ anoTransicao: 3, years: 15 }))
    const noTransicao = r.find((p) => p.ano === 3)!
    const final = r.at(-1)!
    expect(final.patrimonioLiquido).toBeGreaterThan(noTransicao.patrimonioLiquido)
  })

  it('dissídio no mês escolhido aumenta o aporte — mais dissídio, mais patrimônio no fim', () => {
    const sem = simulate(base({ dissidio: 0 })).at(-1)!
    const com = simulate(base({ dissidio: 10 })).at(-1)!
    expect(com.patrimonioLiquido).toBeGreaterThan(sem.patrimonioLiquido)
  })

  it('sem saldo devedor no apê, mais salário ainda ajuda: sobra de FGTS compra studio pronto à vista', () => {
    const baixo = simulate(base({ dividaApe: 0, salarioBrutoCasal: 1_000 })).at(-1)!
    const alto = simulate(base({ dividaApe: 0, salarioBrutoCasal: 200_000 })).at(-1)!
    expect(alto.patrimonioLiquido).toBeGreaterThan(baixo.patrimonioLiquido)
  })

  it('o FGTS quita um saldo pequeno do apê, zera a parcela, e a queda vira aporte mensal dali em diante', () => {
    // sem unidade nenhuma de studio (initial: 0) e sem o aporte cruzar o preço de 1 studio:
    // o único dinheiro em jogo é o que o FGTS libera da parcela do apê.
    const r = simulate(base({
      years: 4, dividaApe: 1, parcelaApeAtual: 1_000, salarioBrutoCasal: 34_000,
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0,
    }))
    expect(r.find((p) => p.ano === 2)!.patrimonioLiquido).toBeCloseTo(1_000, -1)
    expect(r.find((p) => p.ano === 4)!.patrimonioLiquido).toBeCloseTo(1_000 + 24 * 1_000, -1)
  })

  it('o preço do studio novo sobe pelo INCC composto ao ano', () => {
    const r = simulate(base({ incc: 6, custoStudio: 260_000, years: 5 }))
    const ano5 = r.find((p) => p.ano === 5)!
    expect(ano5.precoStudioNovo).toBeCloseTo(260_000 * Math.pow(1.06, 5), -1)
  })

  it('studiosQuitadosEquiv nunca passa de studiosComChaves — quitado é um sub-conjunto de pronto', () => {
    const r = simulate(base({ years: 15 }))
    expect(r.every((p) => p.studiosQuitadosEquiv <= p.studiosComChaves)).toBe(true)
  })

  it('plausível com TODOS os custos padrão ligados: ordem de grandeza de milhões em 15 anos', () => {
    const r = simulate({ ...DEFAULT_PARAMS, years: 15 }).at(-1)!
    expect(r.patrimonioLiquido).toBeGreaterThan(1_000_000)
    expect(r.patrimonioLiquido).toBeLessThan(10_000_000)
    expect(r.studiosComChaves).toBeGreaterThanOrEqual(3)
  })
})

describe('simulateMonthly — o diário de bordo mês a mês', () => {
  const soUmaUnidade = (over: Partial<PlannerParams> = {}) => base({
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 8, ...over,
  })

  it('tempo de obra padrão é 36 meses: em construção até o mês 35, alugada a partir do 36', () => {
    const linhas = simulateMonthly(soUmaUnidade())
    const antes = linhas.find((l) => l.mes === 35)!
    const depois = linhas.find((l) => l.mes === 36)!
    expect(antes.imoveisEmConstrucao).toBe(1)
    expect(antes.imoveisAlugados).toBe(0)
    expect(depois.imoveisEmConstrucao).toBe(0)
    expect(depois.imoveisAlugados).toBe(1)
  })

  it('o tempo de obra é configurável', () => {
    const linhas = simulateMonthly(soUmaUnidade({ prazoObraMeses: 24 }))
    expect(linhas.find((l) => l.mes === 23)!.imoveisEmConstrucao).toBe(1)
    expect(linhas.find((l) => l.mes === 24)!.imoveisAlugados).toBe(1)
  })

  it('uma unidade alugada com saldo financiado cobra parcela; sem saldo, não cobra mais nada', () => {
    const linhas = simulateMonthly(soUmaUnidade())
    const financiada = linhas.find((l) => l.mes === 37)!
    expect(financiada.imoveisFinanciados).toBe(1)
    expect(financiada.imoveisQuitados).toBe(0)
    expect(financiada.totalParcelasFinanciamento).toBeGreaterThan(0)

    const primeiraQuitada = linhas.findIndex((l) => l.imoveisQuitados === 1)
    const depoisDeQuitar = linhas[primeiraQuitada + 1]
    expect(depoisDeQuitar.imoveisFinanciados).toBe(0)
    expect(depoisDeQuitar.totalParcelasFinanciamento).toBe(0)
  })

  it('totalImoveis é sempre em construção + alugados, nunca mais nem menos', () => {
    const linhas = simulateMonthly({ ...DEFAULT_PARAMS, years: 15 })
    expect(linhas.every((l) => l.totalImoveis === l.imoveisEmConstrucao + l.imoveisAlugados)).toBe(true)
  })

  it('o aporte anual aparece só no mês escolhido, e os outros meses ficam com R$0 nessa coluna', () => {
    const linhas = simulateMonthly(base({ annualMonth: 6, years: 1 }))
    expect(linhas.filter((l) => l.aporteAnual > 0).map((l) => l.mesDoAno)).toEqual([6])
  })

  it('uma linha por mês, do mês 1 ao fim do horizonte', () => {
    const linhas = simulateMonthly(base({ years: 3 }))
    expect(linhas.map((l) => l.mes)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1))
  })

  describe('FGTS: abate o apê primeiro, e só depois compra studio PRONTO à vista com a sobra', () => {
    const comFgtsFolgado = (over: Partial<PlannerParams> = {}) => base({
      dividaApe: 50_000, parcelaApeAtual: 1_000, salarioBrutoCasal: 60_000,
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 10, ...over,
    })

    it('o 1º saque quita o apê pequeno e NÃO sobra pra comprar nada ainda', () => {
      const linhas = simulateMonthly(comFgtsFolgado())
      const primeiroSaque = linhas.find((l) => l.abatimentoApeFgts > 0 || l.compraAVistaFgts > 0)!
      expect(primeiroSaque.mes).toBe(24)
      expect(primeiroSaque.abatimentoApeFgts).toBe(50_000)
      expect(primeiroSaque.compraAVistaFgts).toBe(0)
    })

    it('compra com FGTS é de imóvel PRONTO: no mesmo mês já está alugado e quitado, nunca financiado', () => {
      const linhas = simulateMonthly(comFgtsFolgado())
      const compra = linhas.find((l) => l.compraAVistaFgts > 0)!
      expect(compra.imoveisAlugados).toBeGreaterThanOrEqual(1)
      expect(compra.imoveisQuitados).toBeGreaterThanOrEqual(1)
      expect(compra.imoveisFinanciados).toBe(0)
      expect(linhas[compra.mes].rendaMensalLiquida).toBeGreaterThan(0)
    })

    it('com o apê quitado o FGTS não espera o saque de 2 anos: compra assim que FGTS + caixa livre fecham a conta', () => {
      const linhas = simulateMonthly(comFgtsFolgado())
      const compra = linhas.find((l) => l.compraAVistaFgts > 0)!
      const precoDoMes = DEFAULT_PARAMS.custoStudio * Math.pow(1 + DEFAULT_PARAMS.incc / 100, compra.mes / 12)
      // FGTS primeiro; o caixa só completa o que faltar
      expect(compra.compraAVistaFgts + compra.comprasImoveis).toBeCloseTo(precoDoMes, -1)
      expect(compra.saldoFgts).toBe(0)
      expect(compra.saldo).toBeGreaterThanOrEqual(0)
    })

    it('paga o preço de mercado do mês com o desconto à vista', () => {
      const linhas = simulateMonthly(comFgtsFolgado({ descontoAVista: 10 }))
      const compra = linhas.find((l) => l.compraAVistaFgts > 0)!
      const precoDoMes = DEFAULT_PARAMS.custoStudio * Math.pow(1 + DEFAULT_PARAMS.incc / 100, compra.mes / 12)
      expect(compra.compraAVistaFgts + compra.comprasImoveis).toBeCloseTo(precoDoMes * 0.9, -1)
    })

    it('a documentação (ITBI, escritura, registro) não sai do FGTS — sai do caixa', () => {
      const linhas = simulateMonthly(comFgtsFolgado({ itbiPct: 3, escrituraPct: 0.5, registroPct: 0.5 }))
      const compra = linhas.find((l) => l.compraAVistaFgts > 0)!
      expect(compra.documentacao).toBeCloseTo((compra.compraAVistaFgts + compra.comprasImoveis) * 0.04, -1)
      expect(compra.saldo).toBeGreaterThanOrEqual(0)
    })

    it('com saldo devedor no apê, o FGTS vai todo para o apê e não compra studio', () => {
      const linhas = simulateMonthly(comFgtsFolgado({ dividaApe: 5_000_000 }))
      expect(linhas.every((l) => l.compraAVistaFgts === 0)).toBe(true)
      expect(linhas.some((l) => l.abatimentoApeFgts > 0)).toBe(true)
    })
  })

  it('o saldo do FGTS rende sozinho todo mês, mesmo sem nenhum saque ainda', () => {
    const linhas = simulateMonthly(base({
      dividaApe: 0, salarioBrutoCasal: 10_000, custoStudio: 50_000_000, // caro demais pra comprar
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 2,
    }))
    for (let i = 1; i < linhas.length; i++) {
      expect(linhas[i].saldoFgts).toBeGreaterThan(linhas[i - 1].saldoFgts)
    }
  })
})

describe('custos do aluguel', () => {
  // Uma unidade só, já quitada (initial = custo, pagando 100% nas chaves), pronta no mês 36:
  // tudo que muda a renda do mês 40 é custo do aluguel, nada de parcela.
  const unidadeQuitada = (over: Partial<PlannerParams> = {}) => base({
    initial: 260_000, custoStudio: 260_000, pctPagoChaves: 100,
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0,
    impostoHolding: 0, years: 4, ...over,
  })
  const rendaNoMes40 = (over: Partial<PlannerParams> = {}) => simulateMonthly(unidadeQuitada(over))[39].rendaMensalLiquida
  const custosNoMes40 = (over: Partial<PlannerParams> = {}) => simulateMonthly(unidadeQuitada(over))[39].custosImovel

  it('vacância em meses por ano: 3 meses vagos = 3/12 a menos de aluguel recebido', () => {
    expect(rendaNoMes40({ vacanciaMesesAno: 3 })).toBeCloseTo(rendaNoMes40({ vacanciaMesesAno: 0 }) * 0.75, -1)
  })

  it('IPTU e condomínio pagos pelo inquilino, sem vacância, não custam nada ao dono', () => {
    const limpo = rendaNoMes40()
    expect(rendaNoMes40({ iptuPctAno: 1, iptuPagador: 'inquilino', condominioPctAno: 3, condominioPagador: 'inquilino' })).toBe(limpo)
  })

  it('IPTU pago pelo dono sai do aluguel todo mês, como % do valor do imóvel', () => {
    const limpo = rendaNoMes40()
    const comIptu = rendaNoMes40({ iptuPctAno: 1.2, iptuPagador: 'proprietario' })
    expect(limpo - comIptu).toBeGreaterThan(0)
    expect(custosNoMes40({ iptuPctAno: 1.2, iptuPagador: 'proprietario' })).toBeCloseTo(limpo - comIptu, -1)
  })

  it('IPTU e condomínio são independentes: cada um tem o próprio "quem paga"', () => {
    const soCondo = rendaNoMes40({ condominioPctAno: 2, condominioPagador: 'proprietario', iptuPctAno: 1, iptuPagador: 'inquilino' })
    const soIptu = rendaNoMes40({ condominioPctAno: 2, condominioPagador: 'inquilino', iptuPctAno: 1, iptuPagador: 'proprietario' })
    expect(soCondo).toBeLessThan(soIptu) // 2% de condomínio pesa mais que 1% de IPTU
  })

  it('com o imóvel vago, IPTU e condomínio do inquilino caem no colo do dono na proporção dos meses vagos', () => {
    const semCondo = rendaNoMes40({ vacanciaMesesAno: 6 })
    const comCondoDoInquilino = rendaNoMes40({ vacanciaMesesAno: 6, condominioPctAno: 2, condominioPagador: 'inquilino' })
    const comCondoDoDono = rendaNoMes40({ vacanciaMesesAno: 6, condominioPctAno: 2, condominioPagador: 'proprietario' })
    const custoInquilino = semCondo - comCondoDoInquilino
    const custoDono = semCondo - comCondoDoDono
    expect(custoInquilino).toBeCloseTo(custoDono / 2, 0)
  })

  it('taxa da imobiliária é % do aluguel RECEBIDO', () => {
    expect(rendaNoMes40({ taxaAdmPct: 10 })).toBeCloseTo(rendaNoMes40() * 0.9, -1)
  })

  it('manutenção sai do caixa todo mês, mesmo com o imóvel alugado', () => {
    expect(rendaNoMes40({ manutencaoPctAno: 1 })).toBeLessThan(rendaNoMes40())
  })

  it('documentação na compra na planta exige mais caixa: com ITBI/cartório, a 1ª compra demora mais', () => {
    const p = { initial: 0, monthlyAmount: 5_000, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 5 }
    const sem = simulateMonthly(base(p)).find((l) => l.totalImoveis > 0)!.mes
    const com = simulateMonthly(base({ ...p, itbiPct: 3, escrituraPct: 1, registroPct: 1 })).find((l) => l.totalImoveis > 0)!.mes
    expect(com).toBeGreaterThan(sem)
  })
})

describe('venda — só quando o sistema calcula que compensa', () => {
  it('no cenário padrão, alugar vence: nenhuma venda em 15 anos', () => {
    const linhas = simulateMonthly({ ...DEFAULT_PARAMS, years: 15 })
    expect(linhas.every((l) => l.vendas === 0)).toBe(true)
  })

  // Unidade quitada, pronta no mês 36 (dezembro do ano 3, quando a venda é avaliada).
  const quitada = (over: Partial<PlannerParams> = {}) => base({
    initial: 260_000, custoStudio: 260_000, pctPagoChaves: 50, jurosFinHolding: 0,
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0,
    corretagemVendaPct: 0, impostoVendaPct: 0, years: 6, ...over,
  })

  it('vende e compra na planta quando a obra valoriza muito mais que o usado e o aluguel é fraco', () => {
    // com aporte mensal: sem renda nenhuma, o caixa não aguentaria o financiamento das novas
    const p = quitada({ rate: 0, incc: 15, depreciacao: 10, monthlyAmount: 15_000, years: 8 })
    const linhas = simulateMonthly(p)
    const venda = linhas.find((l) => l.vendas > 0)!
    expect(venda).toBeDefined()
    expect(venda.valorVendas).toBeGreaterThan(0)
    expect(venda.totalImoveis).toBeGreaterThanOrEqual(1) // o dinheiro já voltou pra outro studio
    // vender só quando compensa: termina com mais patrimônio que quem foi impedido de vender
    const travado = simulateMonthly({ ...p, impostoVendaPct: 50 }).at(-1)!
    expect(linhas.at(-1)!.patrimonioLiquido).toBeGreaterThan(travado.patrimonioLiquido)
  })

  it('vende e compra outro PRONTO quando o desconto à vista compensa o atrito da venda', () => {
    const linhas = simulateMonthly(quitada({ rate: 1, incc: 0, depreciacao: 0, descontoAVista: 30, years: 4 }))
    const venda = linhas.find((l) => l.vendas > 0)!
    expect(venda).toBeDefined()
    expect(venda.imoveisAlugados).toBeGreaterThanOrEqual(1) // comprou pronto: continua alugando
  })

  it('corretagem e imposto da venda comem o ganho: com atrito alto, o mesmo cenário não vende', () => {
    const linhas = simulateMonthly(quitada({ rate: 0, incc: 15, depreciacao: 10, monthlyAmount: 15_000, years: 8, corretagemVendaPct: 10, impostoVendaPct: 30 }))
    expect(linhas.every((l) => l.vendas === 0)).toBe(true)
  })

  it('totalImoveis continua batendo com construção + alugados depois de vender', () => {
    const linhas = simulateMonthly(quitada({ rate: 0, incc: 15, depreciacao: 10, monthlyAmount: 15_000, years: 8 }))
    expect(linhas.some((l) => l.vendas > 0)).toBe(true)
    expect(linhas.every((l) => l.totalImoveis === l.imoveisEmConstrucao + l.imoveisAlugados)).toBe(true)
  })
})

describe('planejador de compras — saldo acumulado + entradas e saídas previstas decidem o que comprar', () => {
  const soAporte = (over: Partial<PlannerParams> = {}) => base({
    initial: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 10, ...over,
  })

  it('compra na obra ANTES de juntar a entrada inteira: paga durante a obra com o que entra todo mês', () => {
    const linhas = simulateMonthly(soAporte({ monthlyAmount: 10_000 }))
    const compra = linhas.find((l) => l.totalImoveis > 0)!
    const entrada = 260_000 * 0.7
    expect(compra.saldo + compra.comprasImoveis).toBeLessThan(entrada) // não tinha a entrada toda
    expect(compra.imoveisEmConstrucao).toBe(1)
  })

  it('quanto maior a sobra mensal, menos meses de obra faltam no studio que ela compra', () => {
    const mesesAteAlugar = (monthlyAmount: number) => {
      const linhas = simulateMonthly(soAporte({ monthlyAmount }))
      return linhas.find((l) => l.imoveisAlugados > 0)!.mes - linhas.find((l) => l.totalImoveis > 0)!.mes
    }
    expect(mesesAteAlugar(20_000)).toBeLessThan(mesesAteAlugar(8_000))
  })

  it('com o dinheiro todo em caixa, compra pronto para alugar no mês seguinte', () => {
    const linhas = simulateMonthly(soAporte({ monthlyAmount: 0, annualAmount: 400_000, annualMonth: 1, years: 2 }))
    expect(linhas[0].imoveisAlugados).toBeGreaterThanOrEqual(1)
    expect(linhas[1].rendaMensalLiquida).toBeGreaterThan(0)
  })

  it('a renda dos aluguéis compra o próximo studio sozinha, depois que os aportes param', () => {
    const linhas = simulateMonthly(soAporte({ monthlyAmount: 30_000, anoTransicao: 4, years: 15 }))
    const noFimDosAportes = linhas[4 * 12 - 1].totalImoveis
    expect(linhas.at(-1)!.totalImoveis).toBeGreaterThan(noFimDosAportes)
  })

  it('nunca se compromete além do que o caixa aguenta: o saldo não fica negativo', () => {
    for (const p of [{ ...DEFAULT_PARAMS }, soAporte({ monthlyAmount: 10_000 }), soAporte({ monthlyAmount: 30_000, anoTransicao: 4, years: 15 })]) {
      expect(Math.min(...simulateMonthly(p).map((l) => l.saldo))).toBeGreaterThanOrEqual(0)
    }
  })

  it('o saldo de cada mês fecha com as entradas e saídas do mês', () => {
    const linhas = simulateMonthly({ ...DEFAULT_PARAMS, years: 15 })
    let anterior = 0
    for (const l of linhas) {
      const movimento = l.aporteMensal + l.aporteAnual + l.aluguelRecebido + l.valorVendas
        - l.custosImovel - l.totalParcelasFinanciamento - l.comprasImoveis - l.documentacao
      expect(Math.abs(l.saldo - anterior - movimento)).toBeLessThanOrEqual(5) // arredondamento por linha
      anterior = l.saldo
    }
  })

  it('não vende studio se o dinheiro não consegue virar outro sem estourar o caixa', () => {
    // sem renda nenhuma: vender e comprar na planta deixaria um financiamento sem ter como pagar
    const linhas = simulateMonthly(base({
      initial: 260_000, custoStudio: 260_000, pctPagoChaves: 50, jurosFinHolding: 0, rate: 0, incc: 15, depreciacao: 10,
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0,
      corretagemVendaPct: 0, impostoVendaPct: 0, years: 6,
    }))
    expect(linhas.every((l) => l.vendas === 0)).toBe(true)
  })

  it('documentação é gasto, não patrimônio: com ITBI o patrimônio fica menor que o total aportado', () => {
    const p = { monthlyAmount: 10_000, incc: 0, depreciacao: 0, rate: 0, jurosFinHolding: 0, years: 2 }
    const sem = simulateMonthly(soAporte(p)).at(-1)!
    const com = simulateMonthly(soAporte({ ...p, itbiPct: 3 })).at(-1)!
    expect(sem.patrimonioLiquido).toBe(240_000)
    expect(com.patrimonioLiquido).toBeLessThan(240_000)
  })
})
