import { describe, expect, it } from 'vitest'
import { inicioDeHoje } from './calendario'
import { caminhos, eventosDe, roteiroAnual } from './caminhos'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

const p: PlannerParams = { ...DEFAULT_PARAMS, years: 10, anoTransicao: 6 }
const inicio = inicioDeHoje()

describe('as quatro estratégias', () => {
  const r = caminhos(p, inicio)
  it('são construtora, consórcio, leilão e mix, nessa ordem, com o mesmo horizonte', () => {
    expect(r.estrategias.map((e) => e.id)).toEqual(['construtora', 'consorcio', 'leilao', 'mix'])
    for (const e of r.estrategias) expect(e.linhas).toHaveLength(120)
  })
  it('cada uma só usa as ferramentas dela', () => {
    const por = Object.fromEntries(r.estrategias.map((e) => [e.id, e]))
    expect(por.construtora.params.consorcioCotas).toBe(0)
    expect(por.construtora.params.leilaoAtivo).toBeFalsy()
    expect(por.consorcio.params.compraNaPlanta).toBe(false)
    expect(por.consorcio.params.consorcioCotas).toBeGreaterThan(0)
    expect(por.leilao.params.compraNaPlanta).toBe(false)
    expect(por.leilao.params.leilaoAtivo).toBe(true)
    expect(por.mix.params.leilaoAtivo).toBe(true)
    expect(por.mix.params.compraNaPlanta).not.toBe(false)
  })
  it('o mix nunca fica abaixo das duas estratégias que ele combina', () => {
    const rendaDe = (id: string) => r.estrategias.find((e) => e.id === id)!.resumo.rendaFinal
    expect(rendaDe('mix')).toBeGreaterThanOrEqual(Math.min(rendaDe('construtora'), rendaDe('leilao')) - 1)
  })
  it('a recomendada é a de maior patrimônio entre as que fecham o caixa, e a explicação cita a segunda', () => {
    const ordem = [...r.estrategias].filter((e) => e.resumo.menorSaldo >= -1).sort((a, b) => b.resumo.patrimonioFinal - a.resumo.patrimonioFinal)
    expect(r.recomendada).toBe(ordem[0].id)
    expect(r.porque).toContain(ordem[1].nome)
    expect(r.porque.length).toBeLessThan(260)
  })
  it('cada resumo traz aluguel, gastos e sobra por mês que fecham a conta', () => {
    for (const e of r.estrategias) expect(e.resumo.aluguelFinal - e.resumo.gastosFinal).toBeCloseTo(e.resumo.rendaFinal, 0)
  })
})

describe('eventos e roteiro', () => {
  const r = caminhos(p, inicio)
  it('eventos nascem das linhas: leilão, contemplação, venda, chaves', () => {
    const leilao = r.estrategias.find((e) => e.id === 'leilao')!
    const ev = eventosDe(leilao.linhas, leilao.params)
    expect(ev.some((e) => e.tipo === 'leilao')).toBe(true)
    expect(ev.every((e) => e.mes >= 1 && e.mes <= 120 && e.texto.length > 0)).toBe(true)
    expect(ev.some((e) => e.tipo === 'transicao')).toBe(true)
  })
  it('o roteiro tem uma linha por ano, com renda e patrimônio em reais de hoje', () => {
    const e = r.estrategias[0]
    const rot = roteiroAnual(e.linhas, e.params)
    expect(rot).toHaveLength(10)
    expect(rot[0].ano).toBe(1)
    expect(rot.at(-1)!.ano).toBe(10)
    expect(rot.every((x) => x.patrimonioHoje > -1e9 && Number.isFinite(x.rendaHoje))).toBe(true)
  })
})
