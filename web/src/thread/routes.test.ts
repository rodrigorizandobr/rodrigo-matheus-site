import { describe, expect, it } from 'vitest'
import { parsePinch, pinchEnd } from './routes'

const box = { l: 100, t: 200, w: 400, h: 500 }

describe('fim do fio: entre os dedos da mão', () => {
  it('lê do elemento em que ponto da imagem fica a pinça', () => {
    expect(parsePinch('0.0643,0.4131')).toEqual({ x: 0.0643, y: 0.4131 })
  })

  it('marca ausente ou torta cai no meio da imagem, em vez de jogar o fio para fora da tela', () => {
    expect(parsePinch(null)).toEqual({ x: 0.5, y: 0.5 })
    expect(parsePinch('abc')).toEqual({ x: 0.5, y: 0.5 })
  })

  it('o fio termina um pouco DEPOIS da pinça, para a ponta ficar escondida atrás dos dedos', () => {
    const p = pinchEnd(box, { x: 0.1, y: 0.4 }, false)
    expect(p.y).toBe(400)
    expect(p.x).toBeGreaterThan(140) // a pinça está em x=140; a mão fica à direita dela
  })

  it('com a imagem espelhada (desktop) a pinça troca de lado, e o fio entra pelo outro', () => {
    const p = pinchEnd(box, { x: 0.1, y: 0.4 }, true)
    expect(p.y).toBe(400)
    expect(p.x).toBeLessThan(460) // espelhada, a pinça está em x=460; a mão fica à esquerda dela
    expect(460 - p.x).toBe(pinchEnd(box, { x: 0.1, y: 0.4 }, false).x - 140)
  })
})
