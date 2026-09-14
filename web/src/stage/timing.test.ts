import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLIP_FADE_MS } from './timing'

/**
 * A passagem loop → clipe → loop é um esmaecer suave, e precisa ser UMA rampa só: o que está
 * embaixo já está opaco (ver layerPlan), então só o clipe varia. Duas rampas com durações
 * diferentes foi o que o PO viu como "efeito de iluminação".
 * O tempo vive no TS e no CSS; este teste impede que se separem.
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const durations = (selector: string) => {
  const i = css.indexOf(selector)
  expect(i, `regra ${selector} não encontrada`).toBeGreaterThan(-1)
  const block = css.slice(i, css.indexOf('}', i))
  return [...block.matchAll(/transition:\s*opacity\s*([\d.]+)s/g)].map((m) => Math.round(parseFloat(m[1]) * 1000))
}

describe('tempo do esmaecer do clipe — CSS e TS não podem divergir', () => {
  it('entrada (clipe surgindo sobre a origem) usa CLIP_FADE_MS', () => {
    expect(durations('.stage-trans {')).toEqual([CLIP_FADE_MS])
  })
  it('saída (clipe esmaecendo sobre o destino) usa a MESMA duração — a passagem é simétrica', () => {
    expect(durations('.stage-trans[data-fading="true"]')).toEqual([CLIP_FADE_MS])
  })
  it('o esmaecer é perceptível mas não vira fantasma', () => {
    expect(CLIP_FADE_MS).toBeGreaterThanOrEqual(250)
    expect(CLIP_FADE_MS).toBeLessThanOrEqual(600)
  })
})
