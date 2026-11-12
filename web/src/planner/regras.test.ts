import { describe, expect, it } from 'vitest'
import { aplicarRegras } from './regras'
import { comparaLocacao } from './temporada'
import { contaDoAluguel } from './calc'
import { DEFAULT_PARAMS } from './types'

const p = { ...DEFAULT_PARAMS, salarioBrutoCasal: 30_000, annualSalarios: 2.5, years: 20, anoTransicao: 3 }

describe('regras fixas do simulador', () => {
  const e = aplicarRegras(p)
  it('o aporte anual são salários CLT: salários × salário bruto do casal', () => {
    expect(e.annualAmount).toBe(75_000)
    expect(aplicarRegras({ ...p, salarioBrutoCasal: 0 }).annualAmount).toBe(0)
  })
  it('acumula por todo o prazo e vive de aluguel no fim: a transição é o último ano', () => {
    expect(e.anoTransicao).toBe(20)
    expect(e.aposTransicao).toBe('vive_da_renda')
  })
  it('obra pelo INCC e o resto depois das chaves pelo IPCA', () => {
    expect(e.correcaoObraModo).toBe('incc')
    expect(aplicarRegras({ ...p, ipca: 5.25 }).correcaoPosChavesAno).toBe(5.25)
  })
  it('parcelado, sobra do caixa e reserva sempre automáticos', () => {
    expect(aplicarRegras({ ...p, parcelamento: 'manual', sobraDoCaixa: 'adianta_obra', reservaMeses: 0 })).toMatchObject({
      parcelamento: 'automatico', sobraDoCaixa: 'automatico', reservaMeses: 3,
    })
  })
  it('IPTU e condomínio são sempre do inquilino', () => {
    expect(aplicarRegras({ ...p, iptuPagador: 'proprietario', condominioPagador: 'proprietario' })).toMatchObject({
      iptuPagador: 'inquilino', condominioPagador: 'inquilino',
    })
  })
  it('não altera o objeto de entrada', () => {
    const antes = JSON.stringify(p)
    aplicarRegras(p)
    expect(JSON.stringify(p)).toBe(antes)
  })
  it('a diária é um % do valor do imóvel, convertido para reais pelo custo do studio', () => {
    expect(aplicarRegras({ ...p, custoStudio: 300_000, diariaPct: 0.1 }).diariaHoje).toBeCloseTo(300, 6)
  })
  it('o consórcio é decidido pelo sistema (cotas 0) e o lance nunca fica abaixo de 40%', () => {
    expect(aplicarRegras({ ...p, consorcioCotas: 4, consorcioLancePct: 25 })).toMatchObject({ consorcioCotas: 0, consorcioLancePct: 40 })
    expect(aplicarRegras({ ...p, consorcioLancePct: 55 }).consorcioLancePct).toBe(55)
  })
  it('não há meta de renda: o sistema busca o máximo', () => {
    expect(aplicarRegras({ ...p, metaRendaHoje: 15_000 }).metaRendaHoje).toBe(0)
  })
  it('a temporada é tudo ou nada, o que render mais líquido por studio', () => {
    const ano = 2026
    for (const ocupacaoPct of [15, 42, 90]) {
      const q = { ...p, ocupacaoPct }
      const e = aplicarRegras(q, ano)
      const c = comparaLocacao(e, (v) => contaDoAluguel(v, e, ano))
      expect(e.pctTemporada).toBe(c.temporada.liquido > c.longa.liquido ? 100 : 0)
    }
    expect(aplicarRegras({ ...p, ocupacaoPct: 100, taxaPlataformaPct: 0, taxaGestaoPct: 0, impostoTemporadaPct: 0, diariaPct: 0.5 }, 2026).pctTemporada).toBe(100)
    expect(aplicarRegras({ ...p, diariaPct: 0.01 }, 2026).pctTemporada).toBe(0)
  })
})
