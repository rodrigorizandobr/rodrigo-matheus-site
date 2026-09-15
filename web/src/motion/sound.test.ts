import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSoundOn, setSoundOn, SOUND_KEY } from './sound'

beforeEach(() => localStorage.clear())

describe('preferência de som', () => {
  it('nasce DESLIGADO — site que toca som sem pedir é hostil', () => {
    expect(isSoundOn()).toBe(false)
  })

  it('lembra a escolha entre visitas', () => {
    setSoundOn(true)
    expect(localStorage.getItem(SOUND_KEY)).toBe('on')
    expect(isSoundOn()).toBe(true)
    setSoundOn(false)
    expect(isSoundOn()).toBe(false)
  })

  it('valor estranho no armazenamento não liga o som', () => {
    localStorage.setItem(SOUND_KEY, 'talvez')
    expect(isSoundOn()).toBe(false)
  })

  it('armazenamento bloqueado (aba anônima) não quebra a página', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(() => isSoundOn()).not.toThrow()
    expect(isSoundOn()).toBe(false)
    spy.mockRestore()
    const spySet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(() => setSoundOn(true)).not.toThrow()
    spySet.mockRestore()
  })
})

describe('tocar som', () => {
  it('com o som desligado, nada de áudio é criado', async () => {
    const ctor = vi.fn()
    vi.stubGlobal('AudioContext', ctor)
    const { playTick } = await import('./sound')
    setSoundOn(false)
    playTick()
    expect(ctor).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sem suporte a Web Audio, chamar não quebra', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { playTick, playConfirm } = await import('./sound')
    setSoundOn(true)
    expect(() => { playTick(); playConfirm() }).not.toThrow()
    vi.unstubAllGlobals()
  })
})
