import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idToken, signInWithGoogle, signOutUser, watchUser } from '../lib/firebase'
import { pensionApi } from '../pension/api'
import { simulate, simulateMonthly } from '../pension/calc'
import { DEFAULT_PARAMS, type PensionParams } from '../pension/types'
import { formatBRL, formatBRLCompact, formatPct } from '../planner/format'
import { ParamField } from './planner/ParamField'
import { ChoiceField } from './pension/ChoiceField'
import { PensionChart } from './pension/PensionChart'
import { PensionLedger } from './pension/PensionLedger'

type Session = { email: string } | null
type SaveState = 'salvo' | 'salvando' | 'erro' | null

const SAVE_DEBOUNCE_MS = 900

/**
 * /previdencia-privada — simulador de PGBL/VGBL, irmão do "Vivendo de Imóveis":
 * mesmo salário CLT + FGTS automático amortizando o apê, aberto a qualquer
 * conta Google (sem allowlist). Cada pessoa tem o próprio plano, guardado pelo
 * uid (api/pension/). O cálculo roda inteiro no navegador (pension/calc.ts); o
 * backend só guarda e devolve os parâmetros.
 */
export function PensionPage() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [params, setParams] = useState<PensionParams>(DEFAULT_PARAMS)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const api = useMemo(() => pensionApi(idToken), [])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSave = useRef(false)

  useEffect(() => {
    document.title = 'Previdência Privada — Rodrigo Matheus'
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

  const set = useCallback(<K extends keyof PensionParams>(key: K) => (value: PensionParams[K]) =>
    setParams((p) => ({ ...p, [key]: value })), [])

  const pontos = useMemo(() => simulate(params), [params])
  const linhas = useMemo(() => simulateMonthly(params), [params])
  const final = pontos.at(-1)!

  if (session === undefined) {
    return <Shell><p className="text-muted text-[13px]">Verificando sessão…</p></Shell>
  }

  if (session === null) {
    return (
      <Shell>
        <div className="panel hud-frame p-8 md:p-10 max-w-md mx-auto text-center grid gap-5">
          <div>
            <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">PREVIDÊNCIA PRIVADA</div>
            <p className="text-[13px] text-muted mt-2">Simule seu PGBL ou VGBL. Entre com o Google — o plano é só seu.</p>
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
          <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">PREVIDÊNCIA PRIVADA</div>
          <p className="text-[12px] text-muted mt-1">
            {session.email} · {saveState === 'salvando' ? 'salvando…' : saveState === 'erro' ? 'erro ao salvar' : saveState === 'salvo' ? 'salvo' : ' '}
          </p>
        </div>
        <button type="button" onClick={() => signOutUser()} className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">sair</button>
      </div>

      {!loaded ? (
        <p className="text-muted text-[13px]">Carregando seu plano…</p>
      ) : (
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 min-w-0">
          <div className="grid gap-7 content-start min-w-0">
            <Group title="O produto">
              <ChoiceField label="Veículo" value={params.vehicle} onChange={set('vehicle')}
                           options={[{ value: 'PGBL', label: 'PGBL' }, { value: 'VGBL', label: 'VGBL' }]}
                           hint="PGBL deduz até 12% da renda bruta anual do IR (regime completo), mas tributa o resgate inteiro. VGBL não deduz nada, mas só tributa o ganho." />
              <ChoiceField label="Regime de tributação" value={params.regime} onChange={set('regime')}
                           options={[{ value: 'regressiva', label: 'Regressiva' }, { value: 'progressiva', label: 'Progressiva' }]}
                           hint="Regressiva: a alíquota cai com o tempo de cada aporte (35% a 10%), definitiva. Progressiva: entra na tabela do IR junto com o resto da renda." />
              <ParamField label="Sua alíquota marginal de IR" kind="pct" min={0} max={27.5} step={0.5}
                          value={params.aliquotaIrMarginal} onChange={set('aliquotaIrMarginal')}
                          hint="Usada para estimar a restituição do PGBL e o imposto no regime progressivo." />
            </Group>

            <Group title="Seus aportes">
              <ParamField label="Aporte mensal" kind="brl" min={0} max={30_000} step={100}
                          value={params.monthlyAmount} onChange={set('monthlyAmount')} />
              <ParamField label="Aporte anual" kind="brl" min={0} max={500_000} step={1_000}
                          value={params.annualAmount} onChange={set('annualAmount')}
                          hint="Cai de uma vez no mês escolhido abaixo, não espalhado pelo ano." />
              <ParamField label="Mês do aporte anual" kind="mes" min={1} max={12} step={1}
                          value={params.annualMonth} onChange={set('annualMonth')} />
              <ParamField label="Já acumulado hoje" kind="brl" min={0} max={5_000_000} step={5_000}
                          value={params.initial} onChange={set('initial')} />
            </Group>

            <Group title="O fundo">
              <ParamField label="Rendimento bruto do fundo" kind="pct" min={0} max={30} step={0.5}
                          value={params.rendimentoAnual} onChange={set('rendimentoAnual')} />
              <ParamField label="Taxa de administração" kind="pct" min={0} max={5} step={0.1}
                          value={params.taxaAdministracaoAnual} onChange={set('taxaAdministracaoAnual')} />
            </Group>

            <Group title="Mercado">
              <ParamField label="Dissídio anual (salário)" kind="pct" min={0} max={15} step={0.5}
                          value={params.dissidio} onChange={set('dissidio')} />
              <ParamField label="Mês do dissídio" kind="mes" min={1} max={12} step={1}
                          value={params.mesDissidio} onChange={set('mesDissidio')} />
            </Group>

            <Group title="Seu apartamento">
              <ParamField label="Saldo devedor do apartamento em que você mora hoje" kind="brl" min={0} max={2_000_000} step={10_000}
                          value={params.dividaApe} onChange={set('dividaApe')} />
              <ParamField label="Parcela atual do financiamento do apê" kind="brl" min={0} max={30_000} step={100}
                          value={params.parcelaApeAtual} onChange={set('parcelaApeAtual')} />
              <ParamField label="Salário bruto do casal (CLT)" kind="brl" min={0} max={200_000} step={500}
                          value={params.salarioBrutoCasal} onChange={set('salarioBrutoCasal')}
                          hint="Calcula o FGTS (abate o apê a cada 2 anos, a queda da parcela vira aporte extra) e o teto de 12% de dedução do PGBL." />
            </Group>

            <Group title="Horizonte">
              <ParamField label="Anos de simulação" kind="anos" min={1} max={40} step={1}
                          value={params.years} onChange={set('years')} />
            </Group>
          </div>

          <div className="grid gap-6 content-start min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Saldo bruto" value={formatBRLCompact(final.saldoBruto)} title={formatBRL(final.saldoBruto)} />
              <Stat label="Saldo líquido estimado" value={formatBRLCompact(final.saldoLiquidoEstimado)} title={formatBRL(final.saldoLiquidoEstimado)} />
              <Stat label="Alíquota estimada" value={formatPct(final.aliquotaMedia)} />
            </div>
            <PensionChart points={pontos} />
            <PensionLedger linhas={linhas} />
            <p className="text-[11px] text-muted leading-relaxed">
              Simulação educativa, não é recomendação de investimento. O IR no resgate é uma ESTIMATIVA
              (regressiva por tranche; progressiva pela sua alíquota marginal, sem simular a tabela
              completa da declaração). Os números dependem inteiramente dos parâmetros ao lado — ajuste
              para o seu caso real.
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
