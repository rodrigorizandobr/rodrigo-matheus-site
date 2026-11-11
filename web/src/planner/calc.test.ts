import { describe, expect, it } from 'vitest'
import { simulate } from './calc'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

const base = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...over })

describe('simulate — motor puro do simulador de studios', () => {
  it('devolve um ponto por ano, do ano 0 ao horizonte', () => {
    const r = simulate(base({ years: 5 }))
    expect(r.map((p) => p.ano)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('o ano 0 é exatamente o que já foi pago, sem nenhum mês de rendimento', () => {
    const r = simulate(base({ initial: 123_000 }))
    expect(r[0].patrimonioLiquido).toBe(123_000)
  })

  it('sem aporte e sem rendimento, o patrimônio não sai do lugar', () => {
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

  it('o aporte anual cai inteiro no mês escolhido, não espalhado pelo ano', () => {
    // sem aporte mensal nem dissídio: o único dinheiro que entra é o aporte anual
    const r = simulate(base({
      years: 1, monthlyAmount: 0, annualAmount: 120_000, dissidio: 0,
      dividaApe: 0, initial: 0, annualMonth: 1,
    }))
    // caiu em janeiro: só falta 1 mês pra fechar o ano, então o ano 1 é ~120k + quase nada de juro
    expect(r.find((p) => p.ano === 1)!.patrimonioLiquido).toBeGreaterThan(120_000)
  })

  it('aporte anual mais cedo no ano rende mais no fim do mesmo ano do que mais tarde', () => {
    const cedo = simulate(base({
      years: 1, monthlyAmount: 0, dissidio: 0, dividaApe: 0,
      initial: 0, annualAmount: 100_000, annualMonth: 1,
    })).at(-1)!
    const tarde = simulate(base({
      years: 1, monthlyAmount: 0, dissidio: 0, dividaApe: 0,
      initial: 0, annualAmount: 100_000, annualMonth: 12,
    })).at(-1)!
    expect(cedo.patrimonioLiquido).toBeGreaterThan(tarde.patrimonioLiquido)
  })

  it('pagar uma fatia menor nas chaves (mais alavancagem) rende mais patrimônio no fim, quando o retorno do imóvel supera o custo da dívida', () => {
    // aluguel líquido + valorização líquida aqui ficam acima do custo do financiamento
    const semAlavancar = simulate(base({ pctPagoChaves: 100 })).at(-1)!
    const alavancado = simulate(base({ pctPagoChaves: 50 })).at(-1)!
    expect(alavancado.patrimonioLiquido).toBeGreaterThan(semAlavancar.patrimonioLiquido)
  })

  it('pctPagoChaves tem piso de 10% — não divide por quase-zero', () => {
    const r = simulate(base({ pctPagoChaves: 0, years: 1 }))
    expect(Number.isFinite(r.at(-1)!.patrimonioLiquido)).toBe(true)
  })

  it('parar de aportar no ano de transição trava o patrimônio em relação a quem segue aportando', () => {
    const para = simulate(base({ anoTransicao: 5, years: 15 })).at(-1)!
    const segue = simulate(base({ anoTransicao: 15, years: 15 })).at(-1)!
    expect(para.patrimonioLiquido).toBeLessThan(segue.patrimonioLiquido)
  })

  it('depois do ano de transição, a carteira ainda cresce sozinha (reinveste os aluguéis)', () => {
    const r = simulate(base({ anoTransicao: 3, years: 6, monthlyAmount: 10_000, initial: 300_000 }))
    const noTransicao = r.find((p) => p.ano === 3)!
    const depois = r.find((p) => p.ano === 6)!
    expect(depois.patrimonioLiquido).toBeGreaterThan(noTransicao.patrimonioLiquido)
  })

  it('dissídio no mês escolhido aumenta o aporte — mais dissídio, mais patrimônio no fim', () => {
    const sem = simulate(base({ dissidio: 0 })).at(-1)!
    const com = simulate(base({ dissidio: 10 })).at(-1)!
    expect(com.patrimonioLiquido).toBeGreaterThan(sem.patrimonioLiquido)
  })

  it('dissídio mais cedo no ano rende mais no fim do mesmo ano do que mais tarde', () => {
    const cedo = simulate(base({
      years: 1, annualAmount: 0, dividaApe: 0, salarioBrutoCasal: 0, initial: 0,
      monthlyAmount: 1_000, dissidio: 100, mesDissidio: 1,
    })).at(-1)!
    const tarde = simulate(base({
      years: 1, annualAmount: 0, dividaApe: 0, salarioBrutoCasal: 0, initial: 0,
      monthlyAmount: 1_000, dissidio: 100, mesDissidio: 12,
    })).at(-1)!
    expect(cedo.patrimonioLiquido).toBeGreaterThan(tarde.patrimonioLiquido)
  })

  it('sem saldo devedor no apê, o salário não faz nenhuma diferença (não há o que o FGTS abater)', () => {
    const baixo = simulate(base({ dividaApe: 0, salarioBrutoCasal: 1_000 })).at(-1)!
    const alto = simulate(base({ dividaApe: 0, salarioBrutoCasal: 200_000 })).at(-1)!
    expect(alto.patrimonioLiquido).toBe(baixo.patrimonioLiquido)
  })

  it('o FGTS quita um saldo pequeno do apê, zera a parcela, e a queda vira aporte mensal dali em diante', () => {
    // retorno do patrimônio zerado (sem aluguel, sem valorização, sem alavancagem): só soma quem entra
    const r = simulate(base({
      years: 4, dividaApe: 1, parcelaApeAtual: 1_000, salarioBrutoCasal: 34_000,
      monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0,
      rate: 0, incc: 0, depreciacao: 0, jurosFinHolding: 0, pctPagoChaves: 100, anoTransicao: 100,
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

  it('studiosComChaves usa o % pago nas chaves; studiosQuitadosEquiv usa o preço cheio', () => {
    const r = simulate(base({ pctPagoChaves: 50, years: 1 }))
    const ano1 = r.find((p) => p.ano === 1)!
    expect(ano1.studiosComChaves).toBe(Math.floor(ano1.patrimonioLiquido / (ano1.precoStudioNovo * 0.5)))
    expect(ano1.studiosQuitadosEquiv).toBe(Math.floor(ano1.patrimonioLiquido / ano1.precoStudioNovo))
  })

  it('renda mensal líquida é o aluguel líquido sobre os studios equivalentes quitados', () => {
    const r = simulate(base({ years: 10 }))
    const ano10 = r.find((p) => p.ano === 10)!
    const esperado = ano10.studiosQuitadosEquiv * ano10.precoStudioNovo * (base().rate / 100) * (1 - base().impostoHolding / 100)
    expect(ano10.rendaMensalLiquida).toBeCloseTo(esperado, -1)
  })

  it('plausível contra a referência do Gemini (cenário base, aportando até o Ano 15): mesma ordem de grandeza', () => {
    const r = simulate(base({ anoTransicao: 15, years: 15 })).at(-1)!
    // Gemini relatou R$9,22M / 20 com chaves / 14 quitados / R$63.245 no mesmo cenário.
    // Não travamos no número exato (o próprio Gemini dava faixas), só a ordem de grandeza.
    expect(r.patrimonioLiquido).toBeGreaterThan(7_000_000)
    expect(r.patrimonioLiquido).toBeLessThan(12_000_000)
    expect(r.studiosComChaves).toBeGreaterThanOrEqual(15)
    expect(r.studiosQuitadosEquiv).toBeGreaterThanOrEqual(10)
  })
})
