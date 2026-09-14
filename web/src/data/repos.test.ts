import { describe, it, expect } from 'vitest'
import { rarity, languageColor, sparklinePath, timeAgo } from './repos'
import en from '../i18n/en.json'

describe('rarity — stars viram raridade de loot', () => {
  it.each([
    [0, 'common'], [2, 'common'], [3, 'rare'], [9, 'rare'], [10, 'legendary'], [120, 'legendary'],
  ])('%i stars → %s', (stars, r) => expect(rarity(stars)).toBe(r))
})

describe('languageColor — cor por "elemento"', () => {
  it('conhece as linguagens do Rodrigo', () => {
    expect(languageColor('Python')).toBe('#3572A5')
    expect(languageColor('TypeScript')).toBe('#3178C6')
    expect(languageColor('JavaScript')).toBe('#F1E05A')
  })
  it('desconhecida ou vazia cai no cyan da marca', () => {
    expect(languageColor('Brainfuck')).toBe('#00f0ff')
    expect(languageColor('')).toBe('#00f0ff')
  })
})

describe('sparklinePath — 28 dias viram um path SVG 100×24', () => {
  it('gera 28 pontos, começa com M e tem 27 segmentos L', () => {
    const d = sparklinePath(Array.from({ length: 28 }, (_, i) => i % 5))
    expect(d.startsWith('M')).toBe(true)
    expect(d.match(/L/g)).toHaveLength(27)
  })
  it('tudo zero → linha reta na base (y = 24)', () => {
    const d = sparklinePath(new Array(28).fill(0))
    const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]))
    expect(new Set(ys)).toEqual(new Set([24]))
  })
  it('pico ocupa o topo (y = 0) e o eixo x vai de 0 a 100', () => {
    const days = new Array(28).fill(1); days[10] = 9
    const d = sparklinePath(days)
    expect(d).toMatch(/,0(\s|L|$)/)
    expect(d).toMatch(/^M0,/)
    expect(d).toMatch(/L100,[\d.]+$/)
  })
  it('array vazio ou undefined → string vazia (repo sem dados)', () => {
    expect(sparklinePath([])).toBe('')
    expect(sparklinePath(undefined)).toBe('')
  })
})

describe('timeAgo — mesmas 4 unidades do site atual, no idioma certo', () => {
  const now = new Date('2026-09-13T12:00:00Z').getTime()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const t = en.projects.time_ago
  it('< 1 min → "just now"', () => expect(timeAgo(ago(20_000), t, now)).toBe('just now'))
  it('minutos', () => expect(timeAgo(ago(5 * 60_000), t, now)).toBe('5 min ago'))
  it('horas', () => expect(timeAgo(ago(3 * 3_600_000), t, now)).toBe('3 h ago'))
  it('dias', () => expect(timeAgo(ago(2 * 86_400_000), t, now)).toBe('2 d ago'))
  it('data inválida → string vazia', () => expect(timeAgo('nope', t, now)).toBe(''))
})
