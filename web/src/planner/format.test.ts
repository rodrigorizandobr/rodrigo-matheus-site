import { describe, expect, it } from 'vitest'
import { formatBRL, formatBRLCompact, formatPct } from './format'

describe('formatação do simulador', () => {
  it('formatBRL mostra reais sem casa decimal', () => {
    expect(formatBRL(75_000)).toBe('R$ 75.000')
  })
  it('formatBRLCompact encurta valores grandes', () => {
    expect(formatBRLCompact(9_560_000)).toMatch(/R\$\s?9,6\s?mi/)
  })
  it('formatPct acrescenta o símbolo', () => {
    expect(formatPct(70)).toBe('70%')
    expect(formatPct(0.8)).toBe('0,8%')
  })
})
