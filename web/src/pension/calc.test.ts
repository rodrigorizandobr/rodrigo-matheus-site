import { describe, it, expect } from 'vitest'
import { simulate, simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type PensionParams } from './types'

const base = (over: Partial<PensionParams> = {}): PensionParams => ({
  ...DEFAULT_PARAMS,
  dissidio: 0,
  faixasEmpresa: [],
  ...over,
})

describe('simulateMonthly — acumulação', () => {
  it('sem saldo inicial nem aportes, o saldo fica zerado', () => {
    const linhas = simulateMonthly(base({ initial: 0, aporteBasicoPct: 0, aporteExtraPct: 0, years: 5 }))
    expect(linhas.at(-1)!.saldoBruto).toBe(0)
  })

  it('só com saldo inicial, cresce pelo rendimento líquido todo mês', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, aporteBasicoPct: 0, aporteExtraPct: 0, rendimentoAnual: 12, taxaAdministracaoAnual: 0, years: 1,
    }))
    expect(linhas[0].saldoBruto).toBeGreaterThan(100_000)
    expect(linhas.at(-1)!.saldoBruto).toBeCloseTo(112_000, -3)
  })

  it('aporte básico é % do salário, soma tranche nova todo mês', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 10, aporteExtraPct: 0, years: 1,
    }))
    expect(linhas[0].aporteBasico).toBe(1_000)
    expect(linhas[0].saldoBruto).toBeCloseTo(1_000, 0)
  })

  it('aporte extra também é % do salário, mas não recebe contrapartida', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 0, aporteExtraPct: 8,
      faixasEmpresa: [{ idadeMin: 0, idadeMax: 120, percentual: 200 }], years: 1,
    }))
    expect(linhas[0].aporteExtra).toBe(800)
    expect(linhas[0].aporteEmpresa).toBe(0)
  })
})

describe('contrapartida da empresa por faixa de idade', () => {
  it('aporta o percentual da faixa sobre o aporte BÁSICO, nunca sobre o extra', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 5, aporteExtraPct: 5, idadeAtual: 30,
      faixasEmpresa: [{ idadeMin: 0, idadeMax: 40, percentual: 100 }], years: 1,
    }))
    // básico = 500; empresa = 100% de 500 = 500
    expect(linhas[0].aporteBasico).toBe(500)
    expect(linhas[0].aporteEmpresa).toBe(500)
  })

  it('muda de faixa no mês em que a pessoa completa a idade da próxima faixa', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 10, aporteExtraPct: 0, idadeAtual: 40,
      faixasEmpresa: [
        { idadeMin: 0, idadeMax: 40, percentual: 100 },
        { idadeMin: 41, idadeMax: 120, percentual: 200 },
      ],
      years: 2,
    }))
    // mês 1 a 12: idade 40 (faixa 100%); mês 13 em diante: idade 41 (faixa 200%)
    expect(linhas[11].aporteEmpresa).toBe(1_000) // 100% de 1.000
    expect(linhas[12].aporteEmpresa).toBe(2_000) // 200% de 1.000
  })

  it('sem faixa cadastrada pra idade da pessoa, a empresa não aporta nada', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 10, idadeAtual: 60,
      faixasEmpresa: [{ idadeMin: 0, idadeMax: 50, percentual: 200 }], years: 1,
    }))
    expect(linhas[0].aporteEmpresa).toBe(0)
  })

  it('faixas podem ser inseridas, editadas e removidas livremente — lista vazia é válida', () => {
    const linhas = simulateMonthly(base({ initial: 0, salarioBruto: 10_000, aporteBasicoPct: 10, faixasEmpresa: [], years: 1 }))
    expect(linhas[0].aporteEmpresa).toBe(0)
  })
})

describe('simulateMonthly — IR na tabela regressiva', () => {
  it('tranche com mais de 10 anos paga a alíquota mínima (10%)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, aporteBasicoPct: 0, aporteExtraPct: 0, rendimentoAnual: 0, taxaAdministracaoAnual: 0,
      regime: 'regressiva', vehicle: 'PGBL', years: 11,
    }))
    const ultima = linhas.at(-1)!
    expect(ultima.aliquotaMedia).toBeCloseTo(10, 0)
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto * 0.9, 0)
  })

  it('tranche recente (menos de 2 anos) paga a alíquota máxima (35%)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, aporteBasicoPct: 0, aporteExtraPct: 0, rendimentoAnual: 0, taxaAdministracaoAnual: 0,
      regime: 'regressiva', vehicle: 'PGBL', years: 1,
    }))
    expect(linhas.at(-1)!.aliquotaMedia).toBeCloseTo(35, 0)
  })
})

describe('PGBL x VGBL — base tributável', () => {
  it('PGBL tributa o valor CHEIO do resgate (aporte + ganho)', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, aporteBasicoPct: 0, aporteExtraPct: 0, rendimentoAnual: 10, taxaAdministracaoAnual: 0,
      regime: 'progressiva', aliquotaIrMarginal: 20, vehicle: 'PGBL', years: 1,
    }))
    const ultima = linhas.at(-1)!
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto * 0.8, 0)
  })

  it('VGBL tributa só o GANHO — o aporte original nunca é tocado pelo IR', () => {
    const linhas = simulateMonthly(base({
      initial: 100_000, aporteBasicoPct: 0, aporteExtraPct: 0, rendimentoAnual: 10, taxaAdministracaoAnual: 0,
      regime: 'progressiva', aliquotaIrMarginal: 20, vehicle: 'VGBL', years: 1,
    }))
    const ultima = linhas.at(-1)!
    const ganho = ultima.saldoBruto - 100_000
    expect(ultima.saldoLiquidoEstimado).toBeCloseTo(ultima.saldoBruto - ganho * 0.2, 0)
    expect(ultima.saldoLiquidoEstimado).toBeGreaterThanOrEqual(100_000)
  })
})

describe('restituição do PGBL', () => {
  it('reinveste em maio do ano seguinte, limitada a 12% da renda bruta anual — não conta a contrapartida da empresa', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 50, aporteExtraPct: 0, aliquotaIrMarginal: 27.5,
      vehicle: 'PGBL', idadeAtual: 30,
      faixasEmpresa: [{ idadeMin: 0, idadeMax: 120, percentual: 200 }], // contrapartida generosa, não deveria afetar a dedução
      years: 2,
    }))
    // aporte próprio = 5.000/mês × 12 = 60.000; dedução = min(60.000, 12% de 120.000) = 14.400
    // restituição = 14.400 × 27,5% = 3.960
    const maioDoAno2 = linhas[12 + 4]
    expect(maioDoAno2.restituicaoPgbl).toBeCloseTo(3_960, -1)
  })

  it('VGBL nunca gera restituição — não há dedução a restituir', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 50, vehicle: 'VGBL', years: 2,
    }))
    expect(linhas.every((l) => l.restituicaoPgbl === 0)).toBe(true)
  })
})

describe('dissídio', () => {
  it('reajusta o salário no mês escolhido, não antes — o que muda o aporte básico junto', () => {
    const linhas = simulateMonthly(base({
      initial: 0, salarioBruto: 10_000, aporteBasicoPct: 10, dissidio: 10, mesDissidio: 6, years: 1,
    }))
    expect(linhas[4].aporteBasico).toBe(1_000) // maio, antes do dissídio
    expect(linhas[5].aporteBasico).toBe(1_100) // junho, já reajustado
  })
})

describe('simulate — pontos anuais', () => {
  it('ano 0 é o saldo inicial e a idade atual, sem imposto nenhum', () => {
    const pontos = simulate(base({ initial: 42_000, aporteBasicoPct: 0, idadeAtual: 33, years: 3 }))
    expect(pontos[0]).toMatchObject({ ano: 0, idade: 33, saldoBruto: 42_000, saldoLiquidoEstimado: 42_000 })
  })

  it('um ponto por ano, do 0 ao horizonte, com a idade subindo 1 a cada 12 meses completos', () => {
    const pontos = simulate(base({ years: 5, idadeAtual: 30 }))
    expect(pontos.map((p) => p.ano)).toEqual([0, 1, 2, 3, 4, 5])
    // "idadeAtual" é a idade JÁ FEITA hoje: os primeiros 12 meses ainda são do ano com 30
    // anos (o aniversário de 31 só chega no mês 13) — por isso o ano 1 repete a idade do ano 0.
    expect(pontos.map((p) => p.idade)).toEqual([30, 30, 31, 32, 33, 34])
  })

  it('renda mensal estimada não consome o principal — é só o rendimento líquido do saldo', () => {
    const pontos = simulate(base({
      initial: 1_000_000, aporteBasicoPct: 0, rendimentoAnual: 12, taxaAdministracaoAnual: 0, years: 1,
    }))
    const ultimo = pontos.at(-1)!
    expect(ultimo.rendaMensalEstimada).toBeGreaterThan(0)
    expect(ultimo.rendaMensalEstimada).toBeLessThan(ultimo.saldoLiquidoEstimado)
  })
})
