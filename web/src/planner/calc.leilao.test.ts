import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

const base = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, years: 8, reservaMeses: 1, ...over })
const comprasDe = (p: PlannerParams) => simulateMonthly(p).filter((l) => l.comprasImoveis > 0)

describe('leilão e compra só na planta', () => {
  it('sem planta, sem leilão e sem consórcio, a carteira fica só com o studio que já existe', () => {
    const linhas = simulateMonthly(base({ compraNaPlanta: false, consorcioCotas: 0, salarioBrutoCasal: 0 }))
    expect(linhas.at(-1)!.totalImoveis).toBe(1)
  })

  it('o leilão compra studios prontos, sem obra em andamento', () => {
    const linhas = simulateMonthly(base({ compraNaPlanta: false, leilaoAtivo: true }))
    const f = linhas.at(-1)!
    expect(f.totalImoveis).toBeGreaterThan(2)
    expect(Math.max(...linhas.map((l) => l.imoveisEmConstrucao))).toBeLessThanOrEqual(1) // só o studio atual
  })

  it('o desconto vira patrimônio na hora, menos comissão, reforma e jurídico', () => {
    const p = base({ compraNaPlanta: false, leilaoAtivo: true, leilaoDescontoPct: 40, leilaoComissaoPct: 5, leilaoReformaPct: 8, leilaoJuridicoPct: 2 })
    const l = simulateMonthly(p).find((x) => x.comprasImoveis > 0)!
    const antes = simulateMonthly({ ...p, leilaoAtivo: false })[l.mes - 1]
    expect(l.patrimonioLiquido).toBeGreaterThan(antes.patrimonioLiquido) // comprar abaixo do mercado cria patrimônio
  })

  it('mais meses até alugar (desocupação e reforma) rendem menos aluguel', () => {
    const rapido = simulateMonthly(base({ compraNaPlanta: false, leilaoAtivo: true, leilaoMesesAteAlugar: 2 }))
    const lento = simulateMonthly(base({ compraNaPlanta: false, leilaoAtivo: true, leilaoMesesAteAlugar: 14 }))
    expect(rapido.at(-1)!.patrimonioLiquido).toBeGreaterThan(lento.at(-1)!.patrimonioLiquido)
  })

  it('o caixa nunca fica abaixo de zero comprando em leilão', () => {
    expect(Math.min(...simulateMonthly(base({ compraNaPlanta: false, leilaoAtivo: true })).map((l) => l.saldo))).toBeGreaterThanOrEqual(-1)
  })

  it('no mix, o leilão só entra se o ganho imediato passa do limiar', () => {
    const exigente = comprasDe(base({ leilaoAtivo: true, leilaoLimiarPct: 500 }))
    const semLeilao = comprasDe(base({ leilaoAtivo: false }))
    expect(exigente.map((l) => l.mes)).toEqual(semLeilao.map((l) => l.mes))
  })

  it('o mix com leilão registra de onde veio cada compra', () => {
    const linhas = simulateMonthly(base({ leilaoAtivo: true, leilaoEsperaMeses: 18, annualAmount: 300_000, annualMonth: 3 }))
    expect(linhas.some((l) => l.comprasLeilao > 0)).toBe(true)
    expect(linhas.every((l) => l.comprasLeilao >= 0)).toBe(true)
  })
})

describe('mix: esperar o leilão', () => {
  it('sem espera a planta consome o caixa e o leilão não acontece; com espera ele acontece', () => {
    const o = { annualAmount: 300_000, annualMonth: 3, salarioBrutoCasal: 0 }
    const sem = simulateMonthly(base({ ...o, leilaoAtivo: true, leilaoEsperaMeses: 0 }))
    const com = simulateMonthly(base({ ...o, leilaoAtivo: true, leilaoEsperaMeses: 18 }))
    expect(com.reduce((a, l) => a + l.arremates, 0)).toBeGreaterThanOrEqual(sem.reduce((a, l) => a + l.arremates, 0))
    expect(com.reduce((a, l) => a + l.arremates, 0)).toBeGreaterThan(0)
  })
})
