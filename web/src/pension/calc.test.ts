import { describe, it, expect } from 'vitest'
import { simulate, simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type PensionParams } from './types'

const base = (over: Partial<PensionParams> = {}): PensionParams => ({
  ...DEFAULT_PARAMS,
  // Desliga o FGTS/apê por padrão nos testes focados só no motor de previdência —
  // cada teste que precisa dele liga de propósito.
  dividaApe: 0, parcelaApeAtual: 0, salarioBrutoCasal: 0,
  annualAmount: 0, dissidio: 0,
  ...over,
})

describe('simulateMonthly — acumulação', () => {
  it('sem saldo inicial nem aportes, o saldo fica zerado', () => {
    const linhas = simulateMonthly(base({ initial: 0, monthlyAmount: 0, years: 5 }))
    expect(linhas.at(-1)!.saldoBruto).toBe(0)
  })

  it('só com saldo inicial, cresce pelo rendimento líquido todo mês', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 12, taxaAdministracaoAnual: 0, years: 1,
    }))
    expect(linhas[0].saldoBruto).toBeGreaterThan(100_000)
    // 12% a.a. composto por 12 meses ~= 12%, nunca exatamente 12% simples
    expect(linhas.at(-1)!.saldoBruto).toBeCloseTo(112_000, -3)
  })

  it('aporte mensal soma tranche nova todo mês, aumentando o saldo bruto', () => {
    const linhas = simulateMonthly(base({ initial: 0, monthlyAmount: 1_000, years: 1 }))
    expect(linhas[0].saldoBruto).toBeCloseTo(1_000, 0)
    expect(linhas.at(-1)!.saldoBruto).toBeGreaterThan(11_000) // 12 aportes + rendimento
  })

  it('aporte anual cai de uma vez só no mês escolhido', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 0, annualAmount: 50_000, annualMonth: 6, years: 1,
    }))
    expect(linhas[4].aporteAnual).toBe(0) // maio
    expect(linhas[5].aporteAnual).toBe(50_000) // junho
  })
})

describe('simulateMonthly — IR na tabela regressiva', () => {
  it('tranche com mais de 10 anos paga a alíquota mínima (10%)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 0, taxaAdministracaoAnual: 0,
      regime: 'regressiva', vehicle: 'PGBL', years: 11,
    }))
    const ultima = linhas.at(-1)!
    expect(ultima.aliquotaMedia).toBeCloseTo(10, 0)
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto * 0.9, 0)
  })

  it('tranche recente (menos de 2 anos) paga a alíquota máxima (35%)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 0, taxaAdministracaoAnual: 0,
      regime: 'regressiva', vehicle: 'PGBL', years: 1,
    }))
    expect(linhas.at(-1)!.aliquotaMedia).toBeCloseTo(35, 0)
  })

  it('a alíquota média cai com o tempo, nunca sobe', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 5, taxaAdministracaoAnual: 0,
      regime: 'regressiva', vehicle: 'PGBL', years: 15,
    }))
    const aliquotas = [1, 3, 5, 7, 9, 11].map((ano) => linhas[ano * 12 - 1].aliquotaMedia)
    for (let i = 1; i < aliquotas.length; i++) expect(aliquotas[i]).toBeLessThanOrEqual(aliquotas[i - 1])
  })
})

describe('PGBL x VGBL — base tributável', () => {
  it('PGBL tributa o valor CHEIO do resgate (aporte + ganho)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 10, taxaAdministracaoAnual: 0,
      regime: 'progressiva', aliquotaIrMarginal: 20, vehicle: 'PGBL', years: 1,
    }))
    const ultima = linhas.at(-1)!
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto * 0.8, 0)
  })

  it('VGBL tributa só o GANHO — o aporte original nunca é tocado pelo IR', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, monthlyAmount: 0, rendimentoAnual: 10, taxaAdministracaoAnual: 0,
      regime: 'progressiva', aliquotaIrMarginal: 20, vehicle: 'VGBL', years: 1,
    }))
    const ultima = linhas.at(-1)!
    const ganho = ultima.saldoBruto - 100_000
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto - ganho * 0.2, 0)
    // o IR nunca pode comer o aporte original no VGBL
    expect(ultima.saldoLiquidoEstimado).toBeGreaterThanOrEqual(100_000)
  })
})

describe('restituição do PGBL', () => {
  it('reinveste em maio do ano seguinte, limitada a 12% da renda bruta anual', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 5_000, salarioBrutoCasal: 10_000, aliquotaIrMarginal: 27.5,
      vehicle: 'PGBL', years: 2,
    }))
    // dedução = min(60.000 de aporte no ano 1, 12% de 120.000) = 14.400; restituição = 14.400*27,5% = 3.960
    const maioDoAno2 = linhas[12 + 4] // mês 17 = maio do 2º ano
    expect(maioDoAno2.restituicaoPgbl).toBeCloseTo(3_960, -1)
  })

  it('VGBL nunca gera restituição — não há dedução a restituir', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 5_000, salarioBrutoCasal: 10_000, vehicle: 'VGBL', years: 2,
    }))
    expect(linhas.every((l) => l.restituicaoPgbl === 0)).toBe(true)
  })
})

describe('FGTS amortizando o apê', () => {
  it('a cada 2 anos abate o saldo do apê e a sobra vira aporte na previdência', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 0, salarioBrutoCasal: 20_000,
      dividaApe: 1_000, parcelaApeAtual: 500, years: 2,
    }))
    const mes24 = linhas[23]
    expect(mes24.abatimentoApeFgts).toBeGreaterThan(0)
    expect(mes24.abatimentoApeFgts).toBeLessThanOrEqual(1_000)
    // apê de apenas R$1.000 é quitado rápido com FGTS de casal — a sobra vira aporte
    expect(mes24.aporteFgtsExtra).toBeGreaterThan(0)
  })

  it('sem dívida de apê, o FGTS inteiro vira aporte extra no primeiro saque', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 0, salarioBrutoCasal: 20_000, dividaApe: 0, parcelaApeAtual: 0, years: 2,
    }))
    const mes24 = linhas[23]
    expect(mes24.abatimentoApeFgts).toBe(0)
    expect(mes24.aporteFgtsExtra).toBeGreaterThan(0)
    expect(mes24.saldoFgts).toBe(0)
  })
})

describe('dissídio', () => {
  it('reajusta aporte mensal e salário no mês escolhido, não antes', () => {
    const linhas = simulateMonthly(base({
      initial: 0, monthlyAmount: 1_000, dissidio: 10, mesDissidio: 6, years: 1,
    }))
    expect(linhas[4].aporteMensal).toBe(1_000) // maio, antes do dissídio
    expect(linhas[5].aporteMensal).toBe(1_100) // junho, já reajustado
  })
})

describe('simulate — pontos anuais', () => {
  it('ano 0 é o saldo inicial, sem imposto nenhum', () => {
    const pontos = simulate(base({ initial: 42_000, monthlyAmount: 0, years: 3 }))
    expect(pontos[0]).toMatchObject({ ano: 0, saldoBruto: 42_000, saldoLiquidoEstimado: 42_000 })
  })

  it('um ponto por ano, do 0 ao horizonte', () => {
    const pontos = simulate(base({ years: 5 }))
    expect(pontos.map((p) => p.ano)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('renda mensal estimada não consome o principal — é só o rendimento líquido do saldo', () => {
    const pontos = simulate(base({
      initial: 1_000_000, monthlyAmount: 0, rendimentoAnual: 12, taxaAdministracaoAnual: 0, years: 1,
    }))
    const ultimo = pontos.at(-1)!
    expect(ultimo.rendaMensalEstimada).toBeGreaterThan(0)
    expect(ultimo.rendaMensalEstimada).toBeLessThan(ultimo.saldoLiquidoEstimado)
  })
})
