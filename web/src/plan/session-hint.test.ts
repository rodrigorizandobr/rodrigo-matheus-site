import { describe, it, expect, beforeEach, vi } from 'vitest'
import { forgetSignedIn, rememberSignedIn, wasSignedIn } from './session-hint'

beforeEach(() => {
  vi.restoreAllMocks()
  try { window.localStorage.clear() } catch { /* sem armazenamento */ }
})

describe('lembrete de que a pessoa entrou neste navegador', () => {
  it('começa vazio: quem nunca entrou não carrega o Firebase', () => {
    expect(wasSignedIn()).toBe(false)
  })

  it('lembra depois de entrar e esquece ao sair', () => {
    rememberSignedIn()
    expect(wasSignedIn()).toBe(true)
    forgetSignedIn()
    expect(wasSignedIn()).toBe(false)
  })

  it('não guarda nada sobre QUEM entrou: só que alguém entrou', () => {
    rememberSignedIn()
    expect(Object.values(window.localStorage).join('|')).not.toMatch(/@|uid|token/i)
  })

  it('sem armazenamento (janela privada, dados bloqueados) nada estoura e o lembrete fica desligado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(() => rememberSignedIn()).not.toThrow()
    expect(() => forgetSignedIn()).not.toThrow()
    expect(wasSignedIn()).toBe(false)
  })
})
