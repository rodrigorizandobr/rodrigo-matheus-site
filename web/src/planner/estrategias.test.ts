import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { compararEstrategias, escalarContrato, estrategias } from './estrategias'
import { DEFAULT_PARAMS } from './types'

const inicio = { ano: 2026, mes: 11 }
const ate = (p: typeof DEFAULT_PARAMS) => p.entradaPct + p.mensaisPct + p.reforcoPct + p.chavesPct

describe('estratégias', () => {
  it('a primeira é sempre o plano, com os parâmetros intocados', () => {
    const e = estrategias(DEFAULT_PARAMS)
    expect(e[0].id).toBe('plano')
    expect(e[0].params).toBe(DEFAULT_PARAMS)
  })
  it('escalarContrato reparte as quatro fatias somando exatamente o total', () => {
    for (const total of [100, 50, 80, 30]) expect(ate(escalarContrato(DEFAULT_PARAMS, total))).toBe(total)
    expect(escalarContrato(DEFAULT_PARAMS, 100).chavesPct).toBeGreaterThan(DEFAULT_PARAMS.chavesPct)
  })
  it('as variações são o plano com uma coisa mudada, e o cenário ruim sempre existe', () => {
    const e = estrategias(DEFAULT_PARAMS)
    const por = (id: string) => e.find((x) => x.id === id)!
    expect(ate(por('sem_divida').params)).toBe(100)
    expect(ate(por('alavancado').params)).toBe(50)
    expect(por('temporada').params.pctTemporada).toBe(100)
    expect(por('consorcio').params.consorcioCotas).toBe(2)
    expect(por('ruim').params.rate).toBeCloseTo(DEFAULT_PARAMS.rate * 0.85, 10)
    expect(por('ruim').params.vacanciaMesesAno).toBe(DEFAULT_PARAMS.vacanciaMesesAno + 1)
    expect(por('ruim').params.prazoObraMeses).toBe(DEFAULT_PARAMS.prazoObraMeses + 6)
    expect(por('ruim').params.monthlyAmount).toBe(DEFAULT_PARAMS.monthlyAmount)
  })
  it('variação igual ao plano é omitida; temporada e consórcio viram o contrário quando já estão ligados', () => {
    const pago = { ...DEFAULT_PARAMS, entradaPct: 20, mensaisPct: 40, reforcoPct: 20, chavesPct: 20 }
    expect(estrategias(pago).some((x) => x.id === 'sem_divida')).toBe(false)
    const ligado = estrategias({ ...DEFAULT_PARAMS, pctTemporada: 100, consorcioCotas: 2 })
    expect(ligado.find((x) => x.id === 'temporada')!.params.pctTemporada).toBe(0)
    expect(ligado.find((x) => x.id === 'consorcio')!.params.consorcioCotas).toBe(0)
  })
  it('vender nas chaves só entra com ágio', () => {
    expect(estrategias(DEFAULT_PARAMS).some((x) => x.id === 'chaves')).toBe(false)
    expect(estrategias({ ...DEFAULT_PARAMS, agioProntoPct: 15 }).find((x) => x.id === 'chaves')!.params.pctVendaNasChaves).toBe(100)
  })
  it('compararEstrategias: um resultado por estratégia, o do plano bate com a simulação', () => {
    const p = { ...DEFAULT_PARAMS, years: 8 }
    const r = compararEstrategias(p, inicio)
    expect(r).toHaveLength(estrategias(p).length)
    const plano = simulateMonthly(p, inicio).at(-1)!
    expect(r[0].studios).toBe(plano.totalImoveis)
    expect(r[0].patrimonioFinal).toBe(plano.patrimonioLiquido)
    expect(r[0].patrimonioFinalHoje).toBeLessThan(r[0].patrimonioFinal)
    const saldos = simulateMonthly(p, inicio).map((x) => x.saldo)
    expect(r[0].menorSaldo).toBe(Math.min(...saldos))
  })
  it('o cenário ruim não rende mais que o plano', () => {
    const r = compararEstrategias({ ...DEFAULT_PARAMS, years: 12 }, inicio)
    const ruim = r.find((x) => x.id === 'ruim')!
    expect(ruim.rendaDisponivelFinal).toBeLessThanOrEqual(r[0].rendaDisponivelFinal)
  })
})
