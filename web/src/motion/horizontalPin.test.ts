import { describe, it, expect } from 'vitest'
import { pinDistance, shouldPin } from './horizontalPin'

describe('pinDistance — quanto a trilha precisa andar para o lado', () => {
  it('é o que sobra da trilha além da tela', () => {
    expect(pinDistance(6000, 1680)).toBe(4320)
  })

  it('trilha que já cabe na tela não anda nada', () => {
    expect(pinDistance(1200, 1680)).toBe(0)
    expect(pinDistance(1680, 1680)).toBe(0)
  })

  it('nunca devolve negativo', () => {
    expect(pinDistance(0, 1680)).toBe(0)
  })
})

describe('shouldPin — quando a rolagem lateral vale a pena', () => {
  it('liga no desktop, com movimento permitido e trilha maior que a tela', () => {
    expect(shouldPin({ width: 1680, reduceMotion: false, distance: 4320 })).toBe(true)
  })

  it('não prende no celular: sequestrar a rolagem em tela estreita é hostil', () => {
    expect(shouldPin({ width: 390, reduceMotion: false, distance: 4320 })).toBe(false)
  })

  it('respeita quem pediu menos movimento', () => {
    expect(shouldPin({ width: 1680, reduceMotion: true, distance: 4320 })).toBe(false)
  })

  it('não prende se não há o que percorrer', () => {
    expect(shouldPin({ width: 1680, reduceMotion: false, distance: 0 })).toBe(false)
  })
})
