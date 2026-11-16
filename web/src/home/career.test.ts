import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import pt from '../i18n/pt.json'
import { MILESTONES, marcos, startOf } from './career'

describe('linha da carreira', () => {
  it('lê o começo do período nos dois idiomas', () => {
    expect(startOf('setembro de 2019 → agosto de 2021')).toBeCloseTo(2019 + 8 / 12)
    expect(startOf('September 2019 → August 2021')).toBeCloseTo(2019 + 8 / 12)
    expect(startOf('janeiro de 2005 → dezembro de 2005')).toBe(2005)
  })

  it.each([['pt', pt], ['en', en]] as const)('todo marco existe no currículo em %s', (_l, dict) => {
    // se o i18n mudar uma empresa ou data, este teste avisa antes de a linha sair com buraco
    const m = marcos(dict.experience.items)
    expect(m).toHaveLength(MILESTONES.length)
    expect(m.every((x) => x.role.length > 0)).toBe(true)
  })

  it('anda no tempo e nunca desce de nível', () => {
    const m = marcos(pt.experience.items)
    for (let i = 1; i < m.length; i++) {
      expect(m[i].when).toBeGreaterThan(m[i - 1].when)
      expect(m[i].level).toBeGreaterThanOrEqual(m[i - 1].level)
    }
    expect(m[0]).toMatchObject({ company: 'Ponto ED', year: 2005 })
    expect(m[m.length - 1].company).toBe('Digio')
  })

  it('marco que sumiu do currículo fica de fora em vez de quebrar a página', () => {
    expect(marcos([])).toEqual([])
  })
})
