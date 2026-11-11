import { describe, expect, it } from 'vitest'
import { simulate, simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

const base = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...over })

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
      jurosFinHolding: 0, pctPagoChaves: 100, dividaApe: 0,
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

  it('sem saldo devedor no apê, o salário não faz nenhuma diferença (não há o que o FGTS abater)', () => {
    const baixo = simulate(base({ dividaApe: 0, salarioBrutoCasal: 1_000 })).at(-1)!
    const alto = simulate(base({ dividaApe: 0, salarioBrutoCasal: 200_000 })).at(-1)!
    expect(alto.patrimonioLiquido).toBe(baixo.patrimonioLiquido)
  })

  it('o FGTS quita um saldo pequeno do apê, zera a parcela, e a queda vira aporte mensal dali em diante', () => {
    // sem unidade nenhuma de studio (initial: 0) e sem o aporte cruzar o preço de 1 studio:
    // o único dinheiro em jogo é o que o FGTS libera da parcela do apê.
    const r = simulate(base({
      years: 4, dividaApe: 1, parcelaApeAtual: 1_000, salarioBrutoCasal: 34_000,
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0,
    }))
    // saldo de R$1 é quitado de sobra no 1º saque de FGTS (mês 24, ano 2): a parcela de
    // R$1.000 cai a ~R$0, e esse R$1.000 vira aporte mensal a partir do próprio mês 24.
    expect(r.find((p) => p.ano === 2)!.patrimonioLiquido).toBeCloseTo(1_000, -1)
    // do ano 2 ao ano 4: mais 24 meses de R$1.000/mês de aporte extra, sem mais nada mudando
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

  it('plausível contra a referência do Gemini (cenário base): mesma ordem de grandeza', () => {
    const r = simulate(base({ years: 15 })).at(-1)!
    // Gemini relatou R$9,22M / 20 com chaves / 14 quitados no cenário equivalente (aportando
    // até o fim). Este motor é discreto (constrói, só depois aluga e financia de verdade) e
    // chega a uma ordem de grandeza menor, mais conservadora — não travamos no número exato.
    expect(r.patrimonioLiquido).toBeGreaterThan(2_000_000)
    expect(r.patrimonioLiquido).toBeLessThan(10_000_000)
    expect(r.studiosComChaves).toBeGreaterThanOrEqual(5)
  })
})

describe('simulateMonthly — o diário de bordo mês a mês', () => {
  const soUmaUnidade = (over: Partial<PlannerParams> = {}) => base({
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, years: 8, ...over,
  })

  it('a unidade fica "em construção" até o mês da obra, e "alugada" a partir dele', () => {
    const linhas = simulateMonthly(soUmaUnidade())
    const antes = linhas.find((l) => l.mes === 29)!
    const depois = linhas.find((l) => l.mes === 30)!
    expect(antes.imoveisEmConstrucao).toBe(1)
    expect(antes.imoveisAlugados).toBe(0)
    expect(depois.imoveisEmConstrucao).toBe(0)
    expect(depois.imoveisAlugados).toBe(1)
  })

  it('uma unidade alugada com saldo financiado cobra parcela; sem saldo, não cobra mais nada', () => {
    const linhas = simulateMonthly(soUmaUnidade())
    const financiada = linhas.find((l) => l.mes === 31)!
    expect(financiada.imoveisFinanciados).toBe(1)
    expect(financiada.imoveisQuitados).toBe(0)
    expect(financiada.totalParcelasFinanciamento).toBeGreaterThan(0)

    // no mês em que o saldo chega a zero a última parcela ainda é cobrada; só no mês
    // SEGUINTE é que não sobra mais nada para pagar.
    const primeiraQuitada = linhas.findIndex((l) => l.imoveisQuitados === 1)
    const depoisDeQuitar = linhas[primeiraQuitada + 1]
    expect(depoisDeQuitar.imoveisFinanciados).toBe(0)
    expect(depoisDeQuitar.totalParcelasFinanciamento).toBe(0)
  })

  it('totalImoveis é sempre em construção + alugados, nunca mais nem menos', () => {
    const linhas = simulateMonthly(base({ years: 15 }))
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
})
