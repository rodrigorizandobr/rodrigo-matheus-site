import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { alavancagem, benchmarkRendaFixa, cobertura, coberturaObrigacoes, estresse, folego, mesDaMeta, spreadAlavancagem } from './indicadores'
import { DEFAULT_PARAMS, type MonthRow, type PlannerParams } from './types'

/** Uma linha mínima: os testes só preenchem o que o indicador lê. */
const l = (over: Partial<MonthRow> = {}): MonthRow => ({
  mes: 1, anoDoPlano: 1, ano: 2026, mesDoAno: 1, aporteMensal: 0, aporteAnual: 0, abatimentoApeFgts: 0, compraAVistaFgts: 0, saldoFgts: 0,
  imoveisEmConstrucao: 0, imoveisAlugados: 0, imoveisQuitados: 0, imoveisFinanciados: 0, totalImoveis: 0, totalParcelasFinanciamento: 0,
  aluguelRecebido: 0, comprasImoveis: 0, documentacao: 0, saldo: 0, custosImovel: 0, rendaMensalLiquida: 0, vendas: 0, valorVendas: 0,
  patrimonioLiquido: 0, metaDoMes: 0, rendaDisponivel: 0, retirada: 0, parcelaApePaga: 0, saldoApe: 0, parcelaApe: 0, montagem: 0,
  rendimentoCaixa: 0, custoFixoHolding: 0, amortizacaoExtra: 0, dividaFinanciamento: 0, aPagarObra: 0, valorImoveis: 0, parcelasObra: 0,
  obrigacoesMes: 0, parcelasConsorcio: 0, lanceConsorcio: 0, contemplacoes: 0, contemplacoesAtrasadas: 0, dividaConsorcio: 0, comprasLeilao: 0, arremates: 0,
  ...over,
})
const serie = (rendas: number[], meta = 100) => rendas.map((r, i) => l({ mes: i + 1, rendaDisponivel: r, metaDoMes: meta }))

describe('mesDaMeta', () => {
  it('o mês em que a renda cobre a meta e não volta a cair', () => {
    expect(mesDaMeta(serie([10, 20, 30, 40, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210]))).toBe(5)
  })
  it('ignora cruzamentos que não se sustentam por 12 meses', () => {
    const rendas = [50, 50, 50, 50, 100, 100, 100, 100, 50, 50, 50, 50, 50, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    expect(mesDaMeta(serie(rendas))).toBe(14)
  })
  it('nunca cruza, ou não há meta: null', () => {
    expect(mesDaMeta(serie([10, 20, 30]))).toBeNull()
    expect(mesDaMeta(serie([500, 500, 500], 0))).toBeNull()
  })
  it('perto do fim do diário vale o que dá para ver', () => {
    expect(mesDaMeta(serie([10, 10, 10, 100, 100, 100]))).toBe(4)
  })
})

describe('indicadores de dívida', () => {
  it('alavancagem e cobertura, inclusive os casos zero', () => {
    expect(alavancagem(l({ valorImoveis: 1_000_000, dividaFinanciamento: 250_000 }))).toBe(0.25)
    expect(alavancagem(l())).toBe(0)
    expect(cobertura(l({ rendaMensalLiquida: 6_000, totalParcelasFinanciamento: 3_000 }))).toBe(2)
    expect(cobertura(l({ rendaMensalLiquida: 6_000 }))).toBeNull()
  })
  it('spread: retorno do studio menos o custo da dívida (a correção do índice, sem juros)', () => {
    const p: PlannerParams = { ...DEFAULT_PARAMS, cronograma: 'contrato', correcaoPosChavesAno: 4.5, incc: 6.5, depreciacao: 2 }
    const s = spreadAlavancagem(p, 2026)
    expect(s.custoCredito).toBeCloseTo(4.5, 6) // depois das chaves o saldo corre pelo IPCA, sem juros
    expect(s.valorizacao).toBeCloseTo(4.5, 6)
    expect(s.retornoImovel).toBeCloseTo(s.retornoAluguel + 4.5, 6)
    expect(s.spread).toBeCloseTo(s.retornoImovel - 4.5, 6)
    expect(spreadAlavancagem({ ...p, correcaoPosChavesAno: 25 }, 2026).spread).toBeLessThan(0)
  })
})

describe('benchmark de renda fixa', () => {
  const p = (over: Partial<PlannerParams> = {}) => ({ ...DEFAULT_PARAMS, ...over })
  it('sem rendimento é o total aportado', () => {
    const linhas = [1, 2, 3].map((m) => l({ mes: m, aporteMensal: 1_000 }))
    expect(benchmarkRendaFixa(linhas, p({ rendimentoCaixaAno: 0, initial: 5_000 }))).toEqual([6_000, 7_000, 8_000])
  })
  it('com rendimento, juros compostos sobre o saldo', () => {
    const linhas = [1, 2].map((m) => l({ mes: m, aporteMensal: 1_000 }))
    const r = benchmarkRendaFixa(linhas, p({ rendimentoCaixaAno: 12, initial: 0 }))
    expect(r[0]).toBeCloseTo(1_000, 6)
    expect(r[1]).toBeCloseTo(2_009.49, 1)
  })
  it('retirada maior que o saldo zera e fica em zero, sem negativo', () => {
    const linhas = [l({ mes: 1, aporteMensal: 100, retirada: 10_000 }), l({ mes: 2, retirada: 10_000 })]
    expect(benchmarkRendaFixa(linhas, p({ rendimentoCaixaAno: 0, initial: 0 }))).toEqual([0, 0])
  })
  it('um valor por linha do diário', () => {
    expect(benchmarkRendaFixa(simulateMonthly(DEFAULT_PARAMS), DEFAULT_PARAMS)).toHaveLength(180)
  })
})

describe('estresse', () => {
  it('fôlego e cobertura de um mês', () => {
    expect(folego(l({ saldo: 30_000, obrigacoesMes: 10_000 }))).toBe(3)
    expect(folego(l({ saldo: 30_000 }))).toBe(Infinity)
    expect(folego(l({ saldo: -5, obrigacoesMes: 10 }))).toBe(0)
    expect(coberturaObrigacoes(l({ rendaMensalLiquida: 6_000, aporteMensal: 4_000, obrigacoesMes: 20_000 }))).toBe(0.5)
  })
  it('escolhe o pior mês de cada medida, depois da primeira compra', () => {
    const linhas = [
      l({ mes: 1, saldo: 0, obrigacoesMes: 800 }), // antes da primeira compra: não conta
      l({ mes: 2, comprasImoveis: 50_000, saldo: 40_000, obrigacoesMes: 10_000, rendaMensalLiquida: 5_000 }),
      l({ mes: 3, saldo: 12_000, obrigacoesMes: 10_000, rendaMensalLiquida: 8_000 }),
      l({ mes: 4, saldo: 90_000, obrigacoesMes: 30_000, rendaMensalLiquida: 9_000 }),
      l({ mes: 5, saldo: 90_000 }), // sem obrigação: ignora
    ]
    const e = estresse(linhas)
    expect(e.piorFolego).toEqual({ meses: 1.2, mes: 3 })
    expect(e.piorCobertura).toEqual({ razao: 0.3, mes: 4 })
    expect(e.picoObrigacoes).toEqual({ valor: 30_000, mes: 4 })
  })
  it('sem linhas ou sem obrigação: tudo null', () => {
    expect(estresse([])).toEqual({ piorFolego: null, piorCobertura: null, picoObrigacoes: null })
    expect(estresse([l(), l({ mes: 2 })]).piorFolego).toBeNull()
  })
})
