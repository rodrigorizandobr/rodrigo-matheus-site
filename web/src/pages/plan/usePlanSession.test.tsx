import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { forgetSignedIn, rememberSignedIn, wasSignedIn } from '../../plan/session-hint'

type P = { salario: number; anos: number }
const FABRICA: P = { salario: 34_000, anos: 15 }
const PADRAO: P = { salario: 12_000, anos: 10 }
const SALVO: P = { salario: 20_000, anos: 8 }

const api = vi.hoisted(() => ({ getDefaults: vi.fn(), getPlan: vi.fn(), savePlan: vi.fn(), saveDefaults: vi.fn() }))
const firebase = vi.hoisted(() => ({ watchUser: vi.fn(), signInWithGoogle: vi.fn(), signOutUser: vi.fn() }))

vi.mock('../../lib/firebase', () => ({
  idToken: async () => 't',
  appCheckToken: async () => 'prova',
  watchUser: (cb: (u: { email: string } | null) => void) => firebase.watchUser(cb),
  signInWithGoogle: () => firebase.signInWithGoogle(),
  signOutUser: () => firebase.signOutUser(),
}))

import { usePlanSession } from './usePlanSession'

type Usuario = { email: string } | null
let currentUser: Usuario = null
let listener: ((u: Usuario) => void) | null = null

const makeApi = () => api
const montar = () => renderHook(() => usePlanSession<P>({ makeApi, factory: FABRICA }))
const pronto = (r: { current: { ready: boolean } }) => waitFor(() => expect(r.current.ready).toBe(true))
const entrarAntes = (email = 'eu@example.com') => { currentUser = { email }; rememberSignedIn() }
const planoDaConta = (over: Partial<{ params: P; saved: boolean; isAdmin: boolean }> = {}) =>
  api.getPlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true, isAdmin: false, ...over })

beforeEach(() => {
  currentUser = null; listener = null
  forgetSignedIn()
  for (const f of [...Object.values(api), ...Object.values(firebase)]) f.mockReset()
  api.getDefaults.mockResolvedValue({ params: PADRAO, updatedAt: null, custom: true })
  api.getPlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true, isAdmin: false })
  api.savePlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true })
  api.saveDefaults.mockImplementation(async (params: P) => ({ params, updatedAt: null, custom: true }))
  firebase.watchUser.mockImplementation((cb: (u: Usuario) => void) => { listener = cb; cb(currentUser); return () => { listener = null } })
  firebase.signInWithGoogle.mockImplementation(async () => { currentUser = { email: 'eu@example.com' }; listener?.(currentUser) })
  firebase.signOutUser.mockImplementation(async () => { currentUser = null; listener?.(null) })
})
afterEach(() => vi.useRealTimers())

describe('sem entrar', () => {
  it('abre com o padrão que o servidor entrega, sem pedir login', async () => {
    const { result } = montar()
    await pronto(result)
    expect(result.current.params).toEqual(PADRAO)
    expect(result.current.session).toBeNull()
  })

  it('quem nunca entrou não carrega o Firebase nem o plano', async () => {
    const { result } = montar()
    await pronto(result)
    expect(firebase.watchUser).not.toHaveBeenCalled()
    expect(api.getPlan).not.toHaveBeenCalled()
  })

  it('o formulário só aparece quando o padrão chegou: sem piscar do exemplo de fábrica para o padrão', async () => {
    let chegou: (v: unknown) => void = () => {}
    api.getDefaults.mockReturnValue(new Promise((ok) => { chegou = ok }))
    const { result } = montar()
    expect(result.current.ready).toBe(false)
    await act(async () => { chegou({ params: PADRAO, updatedAt: null, custom: true }) })
    expect(result.current.ready).toBe(true)
    expect(result.current.params).toEqual(PADRAO)
  })

  it('se o padrão não chega, usa o exemplo de fábrica e o simulador segue funcionando', async () => {
    api.getDefaults.mockRejectedValue(new Error('fora do ar'))
    const { result } = montar()
    await pronto(result)
    expect(result.current.params).toEqual(FABRICA)
  })

  it('mexer na tela não grava nada, nem depois de muito tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(api.savePlan).not.toHaveBeenCalled()
    expect(api.saveDefaults).not.toHaveBeenCalled()
  })
})

describe('entrar para salvar', () => {
  it('clicar em entrar chama o login do Google e deixa o lembrete para a próxima visita', async () => {
    api.getPlan.mockResolvedValue({ params: PADRAO, updatedAt: null, saved: false, isAdmin: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.session).toEqual({ email: 'eu@example.com' }))
    expect(firebase.signInWithGoogle).toHaveBeenCalled()
    expect(wasSignedIn()).toBe(true)
  })

  it('conta sem plano e tela intocada: segue no padrão e não grava', async () => {
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(api.getPlan).toHaveBeenCalled())
    expect(result.current.params).toEqual(PADRAO)
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('conta sem plano e tela mexida: guarda o que a pessoa montou', async () => {
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(api.savePlan).toHaveBeenCalledWith({ ...PADRAO, anos: 3 }))
    expect(result.current.params).toEqual({ ...PADRAO, anos: 3 })
    expect(result.current.escolha).toBe(false)
  })

  it('conta com plano e tela intocada: carrega o plano salvo', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.params).toEqual(SALVO))
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('conta com plano e tela mexida: pergunta antes de apagar qualquer um dos dois', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.escolha).toBe(true))
    expect(result.current.params).toEqual({ ...PADRAO, anos: 3 })
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('na pergunta, manter o plano salvo traz o salvo e não grava nada', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.escolha).toBe(true))
    act(() => result.current.manterSalvo())
    expect(result.current.params).toEqual(SALVO)
    expect(result.current.escolha).toBe(false)
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('na pergunta, usar a tela substitui o plano salvo', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.escolha).toBe(true))
    await act(async () => { await result.current.usarTela() })
    expect(api.savePlan).toHaveBeenCalledWith({ ...PADRAO, anos: 3 })
    expect(result.current.escolha).toBe(false)
    expect(result.current.params).toEqual({ ...PADRAO, anos: 3 })
  })

  it('enquanto a pergunta está de pé nada é salvo sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login() })
    await waitFor(() => expect(result.current.escolha).toBe(true))
    act(() => result.current.setParams((p) => ({ ...p, anos: 4 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('janela do Google fechada: mostra o erro e segue como visitante', async () => {
    firebase.signInWithGoogle.mockRejectedValue(new Error('popup fechado'))
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login() })
    expect(result.current.error).toMatch(/popup fechado/)
    expect(result.current.session).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(wasSignedIn()).toBe(false)
  })
})

describe('entrar para abrir o que já salvou', () => {
  it('conta com plano e tela mexida: abre o plano salvo direto, sem a pergunta', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.params).toEqual(SALVO))
    expect(result.current.escolha).toBe(false)
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('conta sem plano: avisa que ainda não há nada salvo e que pode ser a conta errada', async () => {
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.notice).toMatch(/ainda não tem plano salvo/i))
    expect(result.current.notice).toMatch(/conta certa/i)
    expect(result.current.params).toEqual(PADRAO)
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('conta com plano: nenhum aviso', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.params).toEqual(SALVO))
    expect(result.current.notice).toBe('')
  })

  it('conta sem plano e tela mexida: guarda a tela, e então não há aviso de "nada salvo"', async () => {
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(api.savePlan).toHaveBeenCalledWith({ ...PADRAO, anos: 3 }))
    expect(result.current.notice).toBe('')
  })

  it('o aviso some na primeira mexida: dali em diante o plano é guardado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.notice).not.toBe(''))
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    expect(result.current.notice).toBe('')
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(api.savePlan).toHaveBeenCalledWith({ ...PADRAO, anos: 3 })
  })

  it('sair apaga o aviso', async () => {
    planoDaConta({ params: PADRAO, saved: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.notice).not.toBe(''))
    await act(async () => { await result.current.logout() })
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(result.current.notice).toBe('')
  })

  it('o motivo do clique não vaza para a entrada seguinte: salvar depois de sair volta a perguntar', async () => {
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    await waitFor(() => expect(result.current.params).toEqual(SALVO))
    await act(async () => { await result.current.logout() })
    await waitFor(() => expect(result.current.params).toEqual(PADRAO))
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login('save') })
    await waitFor(() => expect(result.current.escolha).toBe(true))
  })

  it('a janela do Google fechada: o aviso e o motivo não ficam para trás', async () => {
    firebase.signInWithGoogle.mockRejectedValueOnce(new Error('popup fechado'))
    planoDaConta()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.login('enter') })
    expect(result.current.error).toMatch(/popup fechado/)
    // a próxima entrada é por "salvar": com a tela mexida e plano salvo, a pergunta volta
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await result.current.login('save') })
    await waitFor(() => expect(result.current.escolha).toBe(true))
  })
})

describe('quem já tinha entrado neste navegador', () => {
  it('o plano vem salvo e o formulário só aparece depois dele, sem piscar o padrão', async () => {
    entrarAntes()
    let chegou: (v: unknown) => void = () => {}
    api.getPlan.mockReturnValue(new Promise((ok) => { chegou = ok }))
    const { result } = montar()
    await waitFor(() => expect(api.getPlan).toHaveBeenCalled())
    expect(result.current.ready).toBe(false)
    await act(async () => { chegou({ params: SALVO, updatedAt: null, saved: true, isAdmin: false }) })
    expect(result.current.ready).toBe(true)
    expect(result.current.params).toEqual(SALVO)
    expect(result.current.session).toEqual({ email: 'eu@example.com' })
  })

  it('autosalva 900 ms depois da última mudança, e não antes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    entrarAntes()
    const { result } = montar()
    await pronto(result)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    expect(api.savePlan).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(api.savePlan).toHaveBeenCalledWith({ ...SALVO, anos: 3 })
    expect(result.current.saveState).toBe('salvo')
  })

  it('não salva de novo só por ter carregado o plano', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    entrarAntes()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('plano que não carregou NUNCA é regravado: o autosave não pode apagar o plano de verdade', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    entrarAntes()
    api.getPlan.mockRejectedValue(new Error('Não deu para confirmar que este acesso vem do site.'))
    const { result } = montar()
    await pronto(result)
    expect(result.current.error).toMatch(/vem do site/)
    act(() => result.current.setParams((p) => ({ ...p, anos: 3 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('o login que expirou volta a ser visitante e esquece o lembrete', async () => {
    entrarAntes()
    currentUser = null
    const { result } = montar()
    await pronto(result)
    expect(result.current.session).toBeNull()
    expect(result.current.params).toEqual(PADRAO)
    expect(wasSignedIn()).toBe(false)
  })

  it('sair devolve a tela ao padrão: o plano de uma pessoa não fica à vista num computador de outra', async () => {
    entrarAntes()
    const { result } = montar()
    await pronto(result)
    expect(result.current.params).toEqual(SALVO)
    await act(async () => { await result.current.logout() })
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(result.current.params).toEqual(PADRAO)
    expect(result.current.isAdmin).toBe(false)
    expect(wasSignedIn()).toBe(false)
  })
})

describe('administrador', () => {
  const comoAdmin = () => { entrarAntes('dono@example.com'); planoDaConta({ isAdmin: true }) }

  it('o servidor diz quem é administrador; conta comum não ganha poder nenhum', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    expect(result.current.isAdmin).toBe(true)

    forgetSignedIn(); currentUser = { email: 'alguem@example.com' }; rememberSignedIn()
    planoDaConta({ isAdmin: false })
    const outra = montar()
    await pronto(outra.result)
    expect(outra.result.current.isAdmin).toBe(false)
  })

  it('editar os padrões busca o padrão FRESCO (a borda guarda um minuto) e muda de modo', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    expect(result.current.params).toEqual(SALVO)
    await act(async () => { await result.current.editarPadroes() })
    expect(api.getDefaults).toHaveBeenLastCalledWith(true)
    expect(result.current.mode).toBe('padrao')
    expect(result.current.params).toEqual(PADRAO)
  })

  it('salvar como padrão grava o que está na tela', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.setParams((p) => ({ ...p, anos: 5 })))
    expect(result.current.padrao.sujo).toBe(true)
    await act(async () => { await result.current.salvarPadroes() })
    expect(api.saveDefaults).toHaveBeenCalledWith({ ...PADRAO, anos: 5 })
    expect(result.current.padrao).toEqual({ state: 'salvo', sujo: false })
  })

  it('voltar ao plano traz o plano pessoal de volta e descarta o que não foi salvo como padrão', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.setParams((p) => ({ ...p, anos: 5 })))
    act(() => result.current.voltarAoPlano())
    expect(result.current.mode).toBe('plano')
    expect(result.current.params).toEqual(SALVO)
    expect(api.saveDefaults).not.toHaveBeenCalled()
  })

  it('o plano pessoal NUNCA recebe valores do modo padrão, e o padrão nunca recebe o plano pessoal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.setParams((p) => ({ ...p, anos: 5 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })      // modo padrão: nenhum autosave
    await act(async () => { await result.current.salvarPadroes() })
    act(() => result.current.voltarAoPlano())
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })      // de volta: nada vai para o plano sozinho
    expect(api.savePlan).not.toHaveBeenCalled()
    expect(api.saveDefaults).toHaveBeenCalledTimes(1)
    expect(api.saveDefaults).toHaveBeenCalledWith({ ...PADRAO, anos: 5 })
    expect(api.saveDefaults).not.toHaveBeenCalledWith(SALVO)
  })

  it('depois de voltar, mexer no plano pessoal volta a salvar o plano (não o padrão)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.voltarAoPlano())
    act(() => result.current.setParams((p) => ({ ...p, anos: 2 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(api.savePlan).toHaveBeenCalledWith({ ...SALVO, anos: 2 })
    expect(api.saveDefaults).not.toHaveBeenCalled()
  })

  it('valores de fábrica põem o exemplo do código na tela, sem gravar nada ainda', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.usarFabrica())
    expect(result.current.params).toEqual(FABRICA)
    expect(result.current.padrao.sujo).toBe(true)
    expect(api.saveDefaults).not.toHaveBeenCalled()
  })

  it('conta comum não consegue entrar no modo padrão nem pelo código', async () => {
    entrarAntes(); planoDaConta({ isAdmin: false })
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    expect(result.current.mode).toBe('plano')
    expect(result.current.params).toEqual(SALVO)
    await act(async () => { await result.current.salvarPadroes() })
    expect(api.saveDefaults).not.toHaveBeenCalled()
  })

  it('padrão que o servidor recusou mostra o erro e continua sujo', async () => {
    comoAdmin()
    api.saveDefaults.mockRejectedValue(new Error('years deve estar entre 1 e 40'))
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    act(() => result.current.setParams((p) => ({ ...p, anos: 5 })))
    await act(async () => { await result.current.salvarPadroes() })
    expect(result.current.padrao.state).toBe('erro')
    expect(result.current.padrao.sujo).toBe(true)
    expect(result.current.error).toMatch(/entre 1 e 40/)
  })

  it('sair no meio da edição do padrão volta ao modo normal', async () => {
    comoAdmin()
    const { result } = montar()
    await pronto(result)
    await act(async () => { await result.current.editarPadroes() })
    await act(async () => { await result.current.logout() })
    await waitFor(() => expect(result.current.session).toBeNull())
    expect(result.current.mode).toBe('plano')
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.params).toEqual(PADRAO)
  })
})
