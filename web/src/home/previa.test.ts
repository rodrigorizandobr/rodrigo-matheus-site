import { describe, expect, it } from 'vitest'
import { previa } from './previa'

describe('prévia do simulador na home (motor real)', () => {
  it('sem aporte não há patrimônio, imóvel nem renda', () => {
    const p = previa(0, 15)
    expect(p.patrimonio).toBe(0)
    expect(p.imoveis).toBe(0)
    expect(p.renda).toBe(0)
  })

  it('devolve a curva do começo ao fim do prazo, sempre subindo', () => {
    const p = previa(4000, 15)
    expect(p.pontos).toHaveLength(5)
    expect(p.pontos[0]).toEqual({ ano: 0, patrimonio: 0 })
    expect(p.pontos[4].ano).toBe(15)
    for (let i = 1; i < p.pontos.length; i++) expect(p.pontos[i].patrimonio).toBeGreaterThan(p.pontos[i - 1].patrimonio)
    expect(p.patrimonio).toBe(p.pontos[4].patrimonio)
  })

  it('mais aporte, mais patrimônio; mais prazo, mais patrimônio', () => {
    expect(previa(8000, 15).patrimonio).toBeGreaterThan(previa(4000, 15).patrimonio)
    expect(previa(4000, 25).patrimonio).toBeGreaterThan(previa(4000, 15).patrimonio)
  })

  it('fala em reais de hoje: 15 anos de R$ 4 mil dão algo entre meio e um milhão e meio', () => {
    const p = previa(4000, 15)
    expect(p.patrimonio).toBeGreaterThan(500_000)
    expect(p.patrimonio).toBeLessThan(1_500_000)
    expect(p.imoveis).toBeGreaterThanOrEqual(1)
  })
})
