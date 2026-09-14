import { describe, it, expect } from 'vitest'
import { reduce, initial, resolveActive, type StageState } from './sceneMachine'

describe('resolveActive — qual seção manda no palco', () => {
  it('escolhe a seção cuja faixa central está mais visível; hero por padrão', () => {
    expect(resolveActive([], 'hero')).toBe('hero')
    expect(resolveActive([{ id: 'about', ratio: 0.2 }, { id: 'experience', ratio: 0.6 }], 'hero')).toBe('experience')
  })
  it('mantém a anterior quando nada está visível o suficiente', () => {
    expect(resolveActive([{ id: 'about', ratio: 0.04 }], 'projects')).toBe('projects')
  })
})

describe('reduce — repouso → zoom até a parte → loop → zoom de volta → repouso', () => {
  const rest: StageState = initial('hero')

  it('começa em repouso, sem cena', () => {
    expect(rest).toEqual({ phase: 'rest', scene: null, pending: null })
  })
  it('foco numa seção a partir do repouso inicia o ZOOM-IN para ela', () => {
    expect(reduce(rest, { type: 'focus', section: 'about' })).toEqual({ phase: 'zoomIn', scene: 'about', pending: null })
  })
  it('zoom-in concluído → SHOW (o loop da parte fica visível)', () => {
    const s = reduce(rest, { type: 'focus', section: 'about' })
    expect(reduce(s, { type: 'zoomed' })).toEqual({ phase: 'show', scene: 'about', pending: null })
  })
  it('trocar de seção durante SHOW inicia o ZOOM-OUT guardando o destino', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'projects' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'projects' })
  })
  it('zoom-out concluído com destino → HOLD no repouso (o olho registra o retorno) → ZOOM-IN no destino', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    const hold = reduce(out, { type: 'rested' })
    expect(hold).toEqual({ phase: 'hold', scene: null, pending: 'projects' })
    expect(reduce(hold, { type: 'held' })).toEqual({ phase: 'zoomIn', scene: 'projects', pending: null })
  })
  it('durante o HOLD, voltar ao hero cancela; outra seção troca o destino', () => {
    const hold: StageState = { phase: 'hold', scene: null, pending: 'projects' }
    expect(reduce(hold, { type: 'focus', section: 'hero' })).toEqual({ phase: 'rest', scene: null, pending: null })
    expect(reduce(hold, { type: 'focus', section: 'contact' })).toEqual({ phase: 'hold', scene: null, pending: 'contact' })
  })
  it('zoom-out concluído sem destino (voltou ao hero) → repouso', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: null }
    expect(reduce(out, { type: 'rested' })).toEqual({ phase: 'rest', scene: null, pending: null })
  })
  it('voltar ao hero durante SHOW é zoom-out sem pendência', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'hero' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: null })
  })
  it('mudar de ideia durante o zoom-out só troca o destino (uma transição, não duas)', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    expect(reduce(out, { type: 'focus', section: 'contact' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'contact' })
  })
  it('mudar de ideia durante o zoom-in: termina o zoom, depois sai para o novo destino', () => {
    const zin: StageState = { phase: 'zoomIn', scene: 'about', pending: null }
    const s1 = reduce(zin, { type: 'focus', section: 'projects' })
    expect(s1).toEqual({ phase: 'zoomIn', scene: 'about', pending: 'projects' })
    expect(reduce(s1, { type: 'zoomed' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'projects' })
  })
  it('foco na seção já exibida não faz nada', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'about' })).toBe(show)
  })
  it('voltar para a mesma seção durante o zoom-out cancela a saída', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    expect(reduce(out, { type: 'focus', section: 'about' })).toEqual({ phase: 'zoomIn', scene: 'about', pending: null })
  })
})
