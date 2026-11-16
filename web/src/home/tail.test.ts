import { describe, expect, it } from 'vitest'
import { splitTail } from './tail'

describe('fim da manchete (o trecho que o fio sublinha)', () => {
  it('separa as últimas palavras que cabem numa linha curta', () => {
    expect(splitTail('Com 10 pessoas você fala. Com 40, você desenha')).toEqual(['Com 10 pessoas você fala. Com 40,', 'você desenha'])
  })

  it('palavra comprida fica sozinha', () => {
    expect(splitTail('O dia em que a inteligência artificial')).toEqual(['O dia em que a inteligência', 'artificial'])
  })

  it('título de uma palavra só vai inteiro para o fim', () => {
    expect(splitTail('Sozinho')).toEqual(['', 'Sozinho'])
  })

  it('espaço sobrando não vira palavra', () => {
    expect(splitTail('  Um   título  curto ')).toEqual(['Um', 'título curto'])
  })
})
