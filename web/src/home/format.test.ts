import { describe, expect, it } from 'vitest'
import { brl, shortDate } from './format'

describe('datas e valores da home', () => {
  it('data curta, no dia de São Paulo, nos dois idiomas', () => {
    expect(shortDate('2026-11-14T10:00:01Z', 'pt')).toBe('14 nov 2026')
    expect(shortDate('2026-11-14T10:00:01Z', 'en')).toBe('Nov 14, 2026')
    // 01h UTC ainda é dia 13 em São Paulo
    expect(shortDate('2026-11-14T01:00:00Z', 'pt')).toBe('13 nov 2026')
  })

  it('data vazia ou inválida não vira "Invalid Date" na tela', () => {
    expect(shortDate('', 'pt')).toBe('')
    expect(shortDate('ontem', 'pt')).toBe('')
  })

  it('valores grandes ficam curtos: mil e mi', () => {
    expect(brl(819_000, 'pt')).toBe('R$ 819 mil')
    expect(brl(1_753_000, 'pt')).toBe('R$ 1,8 mi')
    expect(brl(1_753_000, 'en')).toBe('R$ 1.8M')
    expect(brl(819_000, 'en')).toBe('R$ 819K')
    expect(brl(0, 'pt')).toBe('R$ 0')
  })
})
