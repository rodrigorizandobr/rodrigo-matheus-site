import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deepEqual, resolveAfterLogin } from '../../plan/resolve'
import { forgetSignedIn, rememberSignedIn, wasSignedIn } from '../../plan/session-hint'
import type { PlanApi, TokenGetter } from '../../plan/types'

type Firebase = typeof import('../../lib/firebase')

export type Session = { email: string } | null
export type SaveState = 'salvo' | 'salvando' | 'erro' | null
export type Mode = 'plano' | 'padrao'
export type DefaultsStatus = { state: 'ocioso' | 'salvando' | 'salvo' | 'erro'; sujo: boolean }

const SAVE_DEBOUNCE_MS = 900
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

type Options<P> = {
  makeApi: (getToken: TokenGetter, getProof: TokenGetter) => PlanApi<P>
  /** O exemplo de fábrica do código: o que sobra quando o servidor não entrega o padrão. */
  factory: P
}

/**
 * Quem usa um utilitário (imóveis, previdência), com ou sem conta.
 *
 * - SEM conta, a página abre direto com o padrão que o administrador escolheu (leitura pública) e nada é
 *   salvo. O Firebase e o reCAPTCHA nem são carregados: só quando a pessoa clica em salvar, ou quando o
 *   lembrete de `session-hint` diz que ela já entrou antes neste navegador.
 * - COM conta, o plano é autosalvo. `loaded` só vira verdadeiro depois que o plano da conta chegou: plano
 *   que não carregou NUNCA é regravado, senão o autosave apagaria o plano de verdade com o padrão.
 * - Ao entrar com a tela mexida numa conta que já tem plano, a pessoa escolhe qual dos dois manter
 *   (`resolveAfterLogin`).
 * - O ADMINISTRADOR (o servidor diz) também edita os valores padrão, num modo à parte. O plano pessoal dele
 *   fica guardado em memória enquanto isso e volta intacto; nada passa de um lado para o outro sem ele clicar
 *   em salvar, e o autosave do plano fica desligado no modo padrão.
 */
export function usePlanSession<P extends object>({ makeApi, factory }: Options<P>) {
  const firebase = useRef<Promise<Firebase> | null>(null)
  const loadFirebase = useCallback(() => (firebase.current ??= import('../../lib/firebase')), [])
  const api = useMemo(
    () => makeApi(async () => (await loadFirebase()).idToken(), async () => (await loadFirebase()).appCheckToken()),
    [makeApi, loadFirebase],
  )

  const [params, setParams] = useState<P>(factory)
  const [defaultsReady, setDefaultsReady] = useState(false)
  const [bootPending, setBootPending] = useState(wasSignedIn)
  const [session, setSession] = useState<Session>(null)
  const [loaded, setLoaded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [mode, setMode] = useState<Mode>('plano')
  const [escolha, setEscolha] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>(null)
  const [padraoState, setPadraoState] = useState<DefaultsStatus['state']>('ocioso')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const paramsRef = useRef(params)
  paramsRef.current = params
  const factoryRef = useRef(factory)
  const defaultsRef = useRef<P>(factory)        // o padrão público, como a página o recebeu
  const planoRef = useRef<P | null>(null)       // o plano pessoal, guardado enquanto o admin edita o padrão
  const salvoRef = useRef<P | null>(null)       // o plano salvo da conta, enquanto a pessoa escolhe
  const padraoBase = useRef<P | null>(null)     // o padrão como está gravado: a base do "alterações não salvas"
  const skipNextSave = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef(false)
  const unwatch = useRef<(() => void) | null>(null)
  const starting = useRef(false)
  const watchId = useRef(0)
  const lastEmail = useRef<string | undefined>(undefined)

  // 1) O padrão que o servidor entrega. Sem ele (fora do ar), fica o exemplo de fábrica e tudo segue funcionando.
  useEffect(() => {
    let vivo = true
    api.getDefaults()
      .then((d) => { if (vivo) { defaultsRef.current = d.params; setParams(d.params) } })
      .catch(() => { /* sem padrão do servidor: fica o exemplo de fábrica */ })
      .finally(() => { if (vivo) setDefaultsReady(true) })
    return () => { vivo = false }
  }, [api])

  // 2) Quem vigia a sessão do Firebase. Só existe depois de o Firebase ser carregado (clique ou lembrete).
  const startWatching = useCallback(async () => {
    if (unwatch.current || starting.current) return
    starting.current = true
    const id = watchId.current
    try {
      const fb = await loadFirebase()
      if (id !== watchId.current) return
      unwatch.current = fb.watchUser((user) => {
        if (user) { rememberSignedIn(); setSession({ email: user.email ?? '' }) }
        else { forgetSignedIn(); setSession(null); setBootPending(false) }
      })
    } catch (err) {
      setBootPending(false)
      setError(message(err))
    } finally {
      if (id === watchId.current) starting.current = false
    }
  }, [loadFirebase])

  useEffect(() => {
    if (wasSignedIn()) void startWatching()
    return () => { watchId.current += 1; unwatch.current?.(); unwatch.current = null; starting.current = false }
  }, [startWatching])

  const persist = useCallback((p: P) => {
    setSaveState('salvando')
    return api.savePlan(p).then(() => setSaveState('salvo')).catch((err) => { setSaveState('erro'); setError(message(err)) })
  }, [api])

  // 3) Entrou (agora ou numa visita anterior): traz o plano da conta e decide o que fazer com a tela.
  const email = session?.email
  useEffect(() => {
    if (!email || !defaultsReady) return
    let vivo = true
    setLoaded(false); setEscolha(false); setError('')
    api.getPlan().then((plano) => {
      if (!vivo) return
      setIsAdmin(plano.isAdmin)
      const acao = resolveAfterLogin({ hasSavedPlan: plano.saved, touched: !deepEqual(paramsRef.current, defaultsRef.current) })
      skipNextSave.current = true
      if (acao === 'use-server') setParams(plano.params)
      else if (acao === 'save-screen') void persist(paramsRef.current)
      else { salvoRef.current = plano.params; setEscolha(true) }
      setLoaded(true)
      setBootPending(false)
    }).catch((err) => {
      // `loaded` fica falso: o plano que não carregou NUNCA é regravado pelo autosave
      if (!vivo) return
      setError(message(err))
      setBootPending(false)
    })
    return () => { vivo = false }
  }, [email, defaultsReady, api, persist])

  // 4) Saiu (ou o login expirou): a tela volta ao padrão. O plano de uma pessoa não fica à vista no computador de outra.
  useEffect(() => {
    if (lastEmail.current && !email) {
      setParams(defaultsRef.current)
      setIsAdmin(false); setMode('plano'); setEscolha(false); setLoaded(false); setSaveState(null); setPadraoState('ocioso')
      planoRef.current = null; salvoRef.current = null; padraoBase.current = null; skipNextSave.current = false
    }
    lastEmail.current = email
  }, [email])

  // 5) Autosave do plano: só com plano carregado, no modo plano e sem pergunta de pé.
  useEffect(() => {
    if (!loaded || mode !== 'plano' || escolha) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingSave.current = true
    setSaveState('salvando')
    saveTimer.current = setTimeout(() => {
      pendingSave.current = false
      api.savePlan(paramsRef.current).then(() => setSaveState('salvo')).catch(() => setSaveState('erro'))
    }, SAVE_DEBOUNCE_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [params, loaded, mode, escolha, api])

  const login = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const fb = await loadFirebase()
      await startWatching()
      await fb.signInWithGoogle()
      rememberSignedIn()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }, [loadFirebase, startWatching])

  const logout = useCallback(async () => {
    try { await (await loadFirebase()).signOutUser() } catch (err) { setError(message(err)) }
    forgetSignedIn()
  }, [loadFirebase])

  const manterSalvo = useCallback(() => {
    if (salvoRef.current) { skipNextSave.current = true; setParams(salvoRef.current) }
    setEscolha(false)
  }, [])

  const usarTela = useCallback(async () => {
    skipNextSave.current = true
    setEscolha(false)
    await persist(paramsRef.current)
  }, [persist])

  // ── administrador: os valores padrão que todo visitante vê ───────────────────────────────────────
  const editarPadroes = useCallback(async () => {
    if (!isAdmin || mode === 'padrao') return
    setError('')
    try {
      // o autosave do plano ainda não disparou: grava agora, senão a edição se perde ao trocar de modo
      if (pendingSave.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        pendingSave.current = false
        await api.savePlan(paramsRef.current)
      }
      const d = await api.getDefaults(true)
      planoRef.current = paramsRef.current
      padraoBase.current = d.params
      setParams(d.params)
      setPadraoState('ocioso')
      setMode('padrao')
    } catch (err) {
      setError(message(err))
    }
  }, [isAdmin, mode, api])

  const salvarPadroes = useCallback(async () => {
    if (!isAdmin || mode !== 'padrao') return
    const enviado = paramsRef.current
    setPadraoState('salvando'); setError('')
    try {
      await api.saveDefaults(enviado)
      padraoBase.current = enviado
      defaultsRef.current = enviado
      setPadraoState('salvo')
    } catch (err) {
      setPadraoState('erro')
      setError(message(err))
    }
  }, [isAdmin, mode, api])

  const voltarAoPlano = useCallback(() => {
    if (mode !== 'padrao') return
    skipNextSave.current = true
    if (planoRef.current) setParams(planoRef.current)
    planoRef.current = null; padraoBase.current = null
    setPadraoState('ocioso')
    setMode('plano')
  }, [mode])

  const usarFabrica = useCallback(() => {
    if (mode === 'padrao') setParams(factoryRef.current)
  }, [mode])

  const sujo = mode === 'padrao' && padraoBase.current !== null && !deepEqual(params, padraoBase.current)

  return {
    params, setParams,
    /** O formulário já pode aparecer: o padrão chegou e, para quem já tinha entrado, o plano também. */
    ready: defaultsReady && !bootPending,
    session, saveState, isAdmin, mode, escolha, error, busy,
    padrao: { state: padraoState, sujo } satisfies DefaultsStatus,
    login, logout, manterSalvo, usarTela, editarPadroes, salvarPadroes, voltarAoPlano, usarFabrica,
  }
}

export type PlanSession<P extends object> = ReturnType<typeof usePlanSession<P>>
