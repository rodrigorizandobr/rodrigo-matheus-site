import { describe, expect, it } from 'vitest'
import { aplicarRegras } from './regras'
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
})
