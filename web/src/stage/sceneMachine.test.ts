import { describe, it, expect } from 'vitest'
import { reduce, initial, resolveActive, type StageState } from './sceneMachine'

describe('resolveActive — qual seção manda no palco', () => {
  it('escolhe a seção cuja faixa central está mais visível; hero por padrão', () => {
    expect(resolveActive([], 'hero')).toBe('hero')
    expect(resolveActive([{ id: 'about', ratio: 0.2 }, { id: 'experience', ratio: 0.6 }], 'hero')).toBe('experience')
  })
  it('mantém a anterior quando nada está visível o suficiente (evita piscar entre seções)', () => {
    expect(resolveActive([{ id: 'about', ratio: 0.04 }], 'projects')).toBe('projects')
  })
})

describe('reduce — repouso entre dois focos', () => {
  const s0: StageState = initial('hero')

  it('mudar de seção primeiro volta ao repouso (scene=null), guardando o destino', () => {
    const s1 = reduce(s0, { type: 'focus', section: 'about' })
    expect(s1).toMatchObject({ phase: 'resting', scene: null, pending: 'about' })
  })
  it('depois do repouso entra no destino', () => {
    const s1 = reduce(s0, { type: 'focus', section: 'about' })
    const s2 = reduce(s1, { type: 'rested' })
    expect(s2).toMatchObject({ phase: 'showing', scene: 'about', pending: null })
  })
  it('mudar de ideia durante o repouso troca só o destino (uma transição, não duas)', () => {
    const s1 = reduce(s0, { type: 'focus', section: 'about' })
    const s2 = reduce(s1, { type: 'focus', section: 'projects' })
    expect(s2).toMatchObject({ phase: 'resting', pending: 'projects' })
    expect(reduce(s2, { type: 'rested' }).scene).toBe('projects')
  })
  it('foco na seção já exibida não faz nada', () => {
    const s = { ...s0, phase: 'showing' as const, scene: 'about' }
    expect(reduce(s, { type: 'focus', section: 'about' })).toBe(s)
  })
  it('hero é o próprio repouso: voltar para o hero termina em scene=null sem ficar pendente', () => {
    const s = { ...s0, phase: 'showing' as const, scene: 'about' }
    const s1 = reduce(s, { type: 'focus', section: 'hero' })
    expect(s1).toMatchObject({ phase: 'resting', scene: null, pending: null })
    expect(reduce(s1, { type: 'rested' })).toMatchObject({ phase: 'showing', scene: null })
  })
})
