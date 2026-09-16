import { describe, it, expect } from 'vitest'
import { buildCharacter } from './character'
import en from '../i18n/en.json'

describe('buildCharacter — a ficha vem 100% do i18n', () => {
  const c = buildCharacter(en)

  it('LEVEL é o número de anos em tech ("22+" → 22)', () => {
    expect(c.level).toBe(22)
  })

  it('nome e título vêm do hero', () => {
    expect(c.name).toBe('Rodrigo Matheus')
    expect(c.title).toMatch(/Engineering Manager/)
  })

  it('stats: 3 barras do hero.stats + AI/ML derivada da formação, todas com pct 0–100', () => {
    expect(c.stats.map((s) => s.key)).toEqual(['years', 'people', 'leading', 'ai'])
    for (const s of c.stats) {
      expect(s.pct).toBeGreaterThanOrEqual(0)
      expect(s.pct).toBeLessThanOrEqual(100)
    }
  })

  it('pct é proporcional a um teto por stat (40 pessoas / teto 50 = 80%)', () => {
    expect(c.stats.find((s) => s.key === 'people')?.pct).toBe(80)
  })

  it('AI/ML só existe porque há pós em IA na formação', () => {
    const semIA = buildCharacter({ ...en, education: { ...en.education, items: [] } })
    expect(semIA.stats.find((s) => s.key === 'ai')?.pct).toBe(0)
  })

  it('classes vêm de hero.classes quando existe (4 classes, cada uma com gesto)', () => {
    expect(c.classes).toHaveLength(4)
    expect(c.classes[0].id).toBe('eng-manager')
    for (const k of c.classes) expect(k.gesture).toBeTruthy()
  })

  it('sem hero.classes, deriva classes do hero.tag ("A · B · C" → 3)', () => {
    const hero = { ...en.hero } as Record<string, unknown>
    delete hero.classes
    const fallback = buildCharacter({ ...en, hero } as typeof en)
    expect(fallback.classes.map((k) => k.label)).toEqual(['Engineering Manager', 'AI Strategy', 'Fintech'])
  })

  it('a ficha não tem código de identificação — nada no site mostra um', () => {
    expect('callsign' in buildCharacter(en)).toBe(false)
  })

  it('skills são as 10 pills do about', () => {
    expect(c.skills).toHaveLength(10)
    expect(c.skills[0]).toBe('Engineering Management')
  })

  it('i18n ausente não explode: ficha neutra', () => {
    const vazio = buildCharacter(undefined)
    expect(vazio.level).toBe(0)
    expect(vazio.stats).toEqual([])
    expect(vazio.classes).toEqual([])
    expect(vazio.skills).toEqual([])
  })
})
