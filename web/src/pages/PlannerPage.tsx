import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idToken, signInWithGoogle, signOutUser, watchUser } from '../lib/firebase'
import { plannerApi } from '../planner/api'
import { simulate } from '../planner/calc'
import { DEFAULT_PARAMS, type PlannerParams } from '../planner/types'
import { formatBRL, formatBRLCompact } from '../planner/format'
import { ParamField } from './planner/ParamField'
import { PlannerChart } from './planner/PlannerChart'

type Session = { email: string } | null
type SaveState = 'salvo' | 'salvando' | 'erro' | null

const SAVE_DEBOUNCE_MS = 900

/**
 * /vivendo-de-imoveis — simulador de patrimônio em studios, aberto a qualquer conta
 * Google (sem allowlist): cada pessoa tem o próprio plano, guardado pelo uid
 * (api/planner/). O cálculo roda inteiro no navegador (planner/calc.ts); o backend só
 * guarda e devolve os 15 parâmetros.
 */
export function PlannerPage() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [params, setParams] = useState<PlannerParams>(DEFAULT_PARAMS)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const api = useMemo(() => plannerApi(idToken), [])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(false)

  useEffect(() => {
    document.title = 'Vivendo de Imóveis — Rodrigo Matheus'
    return watchUser((user) => setSession(user ? { email: user.email ?? '' } : null))
  }, [])

  useEffect(() => {
    if (!session) return
    let vivo = true
    setLoaded(false)
    api.getPlan().then((plano) => {
      if (!vivo) return
      skipNextSave.current = true
      setParams(plano.params)
      setLoaded(true)
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => { vivo = false }
  }, [session, api])

  // Autosalva 900ms depois da última mudança — não dispara na carga inicial do plano.
  useEffect(() => {
    if (!loaded) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('salvando')
    saveTimer.current = setTimeout(() => {
      api.savePlan(params)
        .then(() => setSaveState('salvo'))
        .catch(() => setSaveState('erro'))
    }, SAVE_DEBOUNCE_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, loaded])

  const set = useCallback(<K extends keyof PlannerParams>(key: K) => (value: number) =>
    setParams((p) => ({ ...p, [key]: value })), [])

  const pontos = useMemo(() => simulate(params), [params])
  const final = pontos.at(-1)!

  if (session === undefined) {
    return <Shell><p className="text-muted text-[13px]">Verificando sessão…</p></Shell>
  }

  if (session === null) {
    return (
      <Shell>
        <div className="panel hud-frame p-8 md:p-10 max-w-md mx-auto text-center grid gap-5">
          <div>
            <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">VIVENDO DE IMÓVEIS</div>
            <p className="text-[13px] text-muted mt-2">Simule sua carteira de studios. Entre com o Google — o plano é só seu.</p>
          </div>
          <button type="button"
                  onClick={() => { setBusy('login'); setError(''); signInWithGoogle().catch((err) => setError((err as Error).message)).finally(() => setBusy(null)) }}
                  disabled={busy === 'login'}
                  className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
            {busy === 'login' ? 'abrindo…' : 'entrar com Google'}
          </button>
          {error && <p className="text-[12px] text-red">{error}</p>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
        <div>
          <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">VIVENDO DE IMÓVEIS</div>
          <p className="text-[12px] text-muted mt-1">
            {session.email} · {saveState === 'salvando' ? 'salvando…' : saveState === 'erro' ? 'erro ao salvar' : saveState === 'salvo' ? 'salvo' : ' '}
          </p>
        </div>
        <button type="button" onClick={() => signOutUser()} className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">sair</button>
      </div>

      {!loaded ? (
        <p className="text-muted text-[13px]">Carregando seu plano…</p>
      ) : (
        <div className="grid lg:grid-cols-[360px_1fr] gap-8">
          <div className="grid gap-7 content-start">
            <Group title="Seus aportes">
              <ParamField label="Aporte médio mensal (parcela + bônus/12)" kind="brl" min={0} max={30_000} step={100}
                          value={params.monthly} onChange={set('monthly')} />
              <ParamField label="Já pago no 1º studio" kind="brl" min={0} max={500_000} step={1_000}
                          value={params.initial} onChange={set('initial')} />
              <ParamField label="Ano de transição para renda passiva" kind="anos" min={0} max={params.years} step={1}
                          value={Math.min(params.anoTransicao, params.years)} onChange={set('anoTransicao')}
                          hint="A partir deste ano, os aportes do bolso caem para R$0 — a carteira cresce só reinvestindo os aluguéis." />
            </Group>

            <Group title="O studio">
              <ParamField label="Custo de 1 studio hoje" kind="brl" min={100_000} max={1_000_000} step={5_000}
                          value={params.custoStudio} onChange={set('custoStudio')} />
              <ParamField label="% pago até pegar as chaves" kind="pct" min={10} max={100} step={5}
                          value={params.pctPagoChaves} onChange={set('pctPagoChaves')}
                          hint="O resto é financiado direto na holding." />
              <ParamField label="Juros do financiamento do saldo (holding)" kind="pct" min={0} max={3} step={0.1}
                          value={params.jurosFinHolding} onChange={set('jurosFinHolding')} />
              <ParamField label="Imposto sobre o aluguel na Holding" kind="pct" min={0} max={27.5} step={0.5}
                          value={params.impostoHolding} onChange={set('impostoHolding')} />
              <ParamField label="Aluguel bruto mensal" kind="pct" min={0} max={2} step={0.05}
                          value={params.rate} onChange={set('rate')} />
            </Group>

            <Group title="Mercado">
              <ParamField label="Valorização dos studios novos (INCC)" kind="pct" min={0} max={15} step={0.5}
                          value={params.incc} onChange={set('incc')} />
              <ParamField label="Perda por envelhecimento do imóvel" kind="pct" min={0} max={10} step={0.5}
                          value={params.depreciacao} onChange={set('depreciacao')}
                          hint="Reduz a valorização dos studios já comprados em relação aos lançamentos." />
              <ParamField label="Dissídio anual (salário e bônus), em agosto" kind="pct" min={0} max={15} step={0.5}
                          value={params.dissidio} onChange={set('dissidio')} />
            </Group>

            <Group title="Seu apartamento">
              <ParamField label="Saldo financiado do apê" kind="brl" min={0} max={2_000_000} step={10_000}
                          value={params.dividaApe} onChange={set('dividaApe')} />
              <ParamField label="Abatimento a cada 3 anos" kind="brl" min={0} max={500_000} step={5_000}
                          value={params.abate3anos} onChange={set('abate3anos')} />
              <ParamField label="Aporte extra por R$100k abatidos" kind="brl" min={0} max={10_000} step={100}
                          value={params.extra100k} onChange={set('extra100k')} />
            </Group>

            <Group title="Horizonte">
              <ParamField label="Anos de simulação" kind="anos" min={1} max={30} step={1}
                          value={params.years} onChange={set('years')} />
            </Group>
          </div>

          <div className="grid gap-6 content-start">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Studios c/ chaves" value={String(final.studiosComChaves)} />
              <Stat label="Studios 100% quitados (equiv.)" value={String(final.studiosQuitadosEquiv)} />
              <Stat label="Renda mensal líquida" value={formatBRLCompact(final.rendaMensalLiquida)} title={formatBRL(final.rendaMensalLiquida)} />
            </div>
            <PlannerChart points={pontos} />
            <p className="text-[11px] text-muted leading-relaxed">
              Simulação educativa, não é recomendação de investimento. Os números dependem inteiramente dos
              parâmetros ao lado — ajuste para o seu caso real.
            </p>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel hud-frame p-5 grid gap-5">
      <div className="hud-label">{title}</div>
      {children}
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="panel hud-frame p-4 text-center" title={title}>
      <div className="font-display font-bold text-[22px] text-heading tabular-nums">{value}</div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-10 md:py-14 min-h-[70svh]">
      {children}
    </div>
  )
}
