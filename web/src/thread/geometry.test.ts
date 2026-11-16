import { describe, expect, it } from 'vitest'
import { buildSegments, crossing, pathD, revealTarget, settled, step, type Pt } from './geometry'

const L: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 80, y: 100 }]

describe('trechos do fio', () => {
  it('cada trecho tem o comprimento, a direção e o quanto de fio veio antes', () => {
    const s = buildSegments(L)
    expect(s.segs).toHaveLength(2)
    expect(s.segs[0]).toMatchObject({ len: 100, ux: 0, uy: 1, L0: 0 })
    expect(s.segs[1]).toMatchObject({ len: 80, ux: 1, uy: 0, L0: 100 })
    expect(s.total).toBe(180)
  })

  it('pontos repetidos não geram divisão por zero', () => {
    const s = buildSegments([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 9 }])
    expect(Number.isFinite(s.segs[0].ux)).toBe(true)
    expect(s.total).toBeGreaterThan(0)
  })

  it('menos de dois pontos é fio nenhum', () => {
    expect(buildSegments([]).total).toBe(0)
    expect(pathD([{ x: 1, y: 1 }], buildSegments([{ x: 1, y: 1 }]).segs, [])).toBe('')
  })
})

describe('caminho desenhado', () => {
  it('começa no primeiro ponto, termina no último e arredonda a quina sem passar por ela', () => {
    const { segs } = buildSegments(L)
    const d = pathD(L, segs, [0, 0])
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d.endsWith('80.0 100.0')).toBe(true)
    // a quina (0,100) aparece só como ponto de controle da curva, cercada pelos cortes de 13 px
    expect(d).toContain('0.0 87.0')
    expect(d).toContain('Q0.0 100.0 13.0 100.0')
  })

  it('o trecho dedilhado se curva para o lado, na perpendicular', () => {
    const p: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }]
    const { segs } = buildSegments(p)
    expect(pathD(p, segs, [0])).toContain('Q0.0 50.0')
    expect(pathD(p, segs, [10])).toContain('Q-20.0 50.0')
  })
})

describe('quanto do fio aparece conforme a rolagem', () => {
  const { segs } = buildSegments(L)

  it('nada antes do começo, tudo depois do fim, e cresce junto com a rolagem', () => {
    expect(revealTarget(L, segs, -10)).toBe(0)
    expect(revealTarget(L, segs, 50)).toBe(50)
    expect(revealTarget(L, segs, 100)).toBe(180)
    expect(revealTarget(L, segs, 9999)).toBe(180)
  })

  it('trecho que sobe só aparece inteiro, quando a rolagem alcança o ponto de onde ele parte', () => {
    const p: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 40 }, { x: 50, y: 200 }]
    const s = buildSegments(p).segs
    expect(revealTarget(p, s, 99)).toBe(99)
    expect(revealTarget(p, s, 100)).toBeGreaterThan(100 + s[1].len - 0.001)
  })
})

describe('o ponteiro dedilha', () => {
  const p: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }]
  const g = buildSegments(p).segs[0]

  it('cruzar o trecho devolve a velocidade perpendicular; passar ao lado, nada', () => {
    expect(crossing(p[0], g, { x: -5, y: 50 }, { x: 5, y: 50 })).not.toBe(0)
    expect(crossing(p[0], g, { x: 5, y: 50 }, { x: 9, y: 50 })).toBe(0)
  })

  it('cruzar para fora das pontas não conta', () => {
    expect(crossing(p[0], g, { x: -5, y: 150 }, { x: 5, y: 150 })).toBe(0)
  })

  it('sentidos opostos dão sinais opostos', () => {
    const ida = crossing(p[0], g, { x: -5, y: 50 }, { x: 5, y: 50 })
    const volta = crossing(p[0], g, { x: 5, y: 50 }, { x: -5, y: 50 })
    expect(Math.sign(ida)).toBe(-Math.sign(volta))
  })
})

describe('mola', () => {
  it('um puxão vibra e volta ao repouso', () => {
    const segs = buildSegments([{ x: 0, y: 0 }, { x: 0, y: 300 }]).segs
    const disp = [0], vel = [12]
    step(segs, disp, vel)
    expect(disp[0]).not.toBe(0)
    for (let i = 0; i < 400; i++) step(segs, disp, vel)
    expect(settled(disp, vel)).toBe(true)
  })

  it('o desvio nunca passa de uma fração do trecho', () => {
    const segs = buildSegments([{ x: 0, y: 0 }, { x: 0, y: 50 }]).segs
    const disp = [0], vel = [500]
    step(segs, disp, vel)
    expect(Math.abs(disp[0])).toBeLessThanOrEqual(50 * 0.16)
  })
})
