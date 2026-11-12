import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idToken, signInWithGoogle, signOutUser, watchUser } from '../lib/firebase'
import { plannerApi } from '../planner/api'
import { pontosAnuais, simulateMonthly } from '../planner/calc'
import { DEFAULT_PARAMS, type PlannerParams } from '../planner/types'
import { formatBRL, formatBRLCompact } from '../planner/format'
import { ParamField } from './planner/ParamField'
import { ChoiceField } from './pension/ChoiceField'
import type { Pagador } from '../planner/types'

const QUEM_PAGA: { value: Pagador; label: string }[] = [
  { value: 'inquilino', label: 'Inquilino' },
  { value: 'proprietario', label: 'Proprietário' },
]
import { PlannerChart } from './planner/PlannerChart'
import { PlannerLedger } from './planner/PlannerLedger'

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

  const set = useCallback(<K extends keyof PlannerParams>(key: K) => (value: PlannerParams[K]) =>
    setParams((p) => ({ ...p, [key]: value })), [])

  const linhas = useMemo(() => simulateMonthly(params), [params])
  const pontos = useMemo(() => pontosAnuais(linhas, params), [linhas, params])
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
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 min-w-0">
          <div className="grid gap-7 content-start min-w-0">
            <Group title="Seus aportes">
              <ParamField label="Aporte mensal" kind="brl" min={0} max={30_000} step={100}
                          value={params.monthlyAmount} onChange={set('monthlyAmount')} />
              <ParamField label="Aporte anual" kind="brl" min={0} max={500_000} step={1_000}
                          value={params.annualAmount} onChange={set('annualAmount')}
                          hint="Cai de uma vez no mês escolhido abaixo, não espalhado pelo ano." />
              <ParamField label="Mês do aporte anual" kind="mes" min={1} max={12} step={1}
                          value={params.annualMonth} onChange={set('annualMonth')} />
              <ParamField label="Já pago no 1º studio" kind="brl" min={0} max={500_000} step={1_000}
                          value={params.initial} onChange={set('initial')} />
              <ParamField label="Ano de transição para renda passiva" kind="anos" min={0} max={params.years} step={1}
                          value={Math.min(params.anoTransicao, params.years)} onChange={set('anoTransicao')}
                          hint="A partir deste ano, os aportes do bolso caem para R$0 — a carteira cresce só reinvestindo os aluguéis." />
            </Group>

            <Group title="O studio">
              <ParamField label="Custo de 1 studio hoje" kind="brl" min={100_000} max={1_000_000} step={5_000}
                          value={params.custoStudio} onChange={set('custoStudio')} />
              <ParamField label="Tempo de obra" kind="meses" min={12} max={60} step={1}
                          value={params.prazoObraMeses} onChange={set('prazoObraMeses')}
                          hint="Obra mais longa que o sistema aceita comprar. Ele sempre procura o studio com MENOS meses de obra faltando que o seu caixa consegue pagar até as chaves." />
              <ParamField label="% pago até pegar as chaves" kind="pct" min={10} max={100} step={5}
                          value={params.pctPagoChaves} onChange={set('pctPagoChaves')}
                          hint="O resto é financiado direto na construtora." />
              <ParamField label="Juros do financiamento do saldo (holding)" kind="pct" min={0} max={3} step={0.1}
                          value={params.jurosFinHolding} onChange={set('jurosFinHolding')} />
              <ParamField label="Imposto sobre o aluguel na Holding" kind="pct" min={0} max={27.5} step={0.5}
                          value={params.impostoHolding} onChange={set('impostoHolding')} />
              <ParamField label="Aluguel bruto mensal" kind="pct" min={0} max={2} step={0.05}
                          value={params.rate} onChange={set('rate')} />
            </Group>

            <Group title="Custos do aluguel">
              <ParamField label="Vacância" kind="meses" min={0} max={6} step={0.5}
                          value={params.vacanciaMesesAno} onChange={set('vacanciaMesesAno')}
                          hint="Meses por ano sem inquilino. Padrão de mercado: 1 mês por ano." />
              <ParamField label="IPTU" kind="pct" min={0} max={3} step={0.1}
                          value={params.iptuPctAno} onChange={set('iptuPctAno')}
                          hint="% ao ano sobre o valor atual do imóvel." />
              <ChoiceField label="Quem paga o IPTU" value={params.iptuPagador} onChange={set('iptuPagador')} options={QUEM_PAGA} />
              <ParamField label="Condomínio" kind="pct" min={0} max={6} step={0.1}
                          value={params.condominioPctAno} onChange={set('condominioPctAno')}
                          hint="% ao ano sobre o valor atual do imóvel." />
              <ChoiceField label="Quem paga o condomínio" value={params.condominioPagador} onChange={set('condominioPagador')} options={QUEM_PAGA}
                           hint="Mesmo pago pelo inquilino, nos meses vagos IPTU e condomínio saem do seu bolso." />
              <ParamField label="Taxa da imobiliária" kind="pct" min={0} max={20} step={0.5}
                          value={params.taxaAdmPct} onChange={set('taxaAdmPct')}
                          hint="% do aluguel recebido. Zere se você mesmo administra." />
              <ParamField label="Manutenção e reformas" kind="pct" min={0} max={3} step={0.1}
                          value={params.manutencaoPctAno} onChange={set('manutencaoPctAno')}
                          hint="% ao ano do valor do imóvel, pago pelo dono." />
            </Group>

            <Group title="Documentação de compra">
              <ParamField label="ITBI" kind="pct" min={0} max={5} step={0.1}
                          value={params.itbiPct} onChange={set('itbiPct')} />
              <ParamField label="Escritura" kind="pct" min={0} max={3} step={0.1}
                          value={params.escrituraPct} onChange={set('escrituraPct')} />
              <ParamField label="Registro" kind="pct" min={0} max={3} step={0.1}
                          value={params.registroPct} onChange={set('registroPct')}
                          hint="Tudo em % do preço pago, em toda compra — na planta ou pronta." />
              <ParamField label="Desconto à vista (imóvel pronto)" kind="pct" min={0} max={30} step={1}
                          value={params.descontoAVista} onChange={set('descontoAVista')}
                          hint="O poder do dinheiro à vista: vale para compras com FGTS e com o dinheiro de uma venda." />
            </Group>

            <Group title="Venda">
              <ParamField label="Corretagem na venda" kind="pct" min={0} max={10} step={0.5}
                          value={params.corretagemVendaPct} onChange={set('corretagemVendaPct')} />
              <ParamField label="Imposto na venda" kind="pct" min={0} max={20} step={0.1}
                          value={params.impostoVendaPct} onChange={set('impostoVendaPct')}
                          hint="% do valor de venda (holding no lucro presumido ≈ 6,73%). Todo dezembro o sistema compara manter cada studio quitado contra vender e comprar na planta ou pronto com desconto — só vende quando compensa." />
            </Group>

            <Group title="Mercado">
              <ParamField label="Valorização dos studios novos (INCC)" kind="pct" min={0} max={15} step={0.5}
                          value={params.incc} onChange={set('incc')} />
              <ParamField label="Perda por envelhecimento do imóvel" kind="pct" min={0} max={10} step={0.5}
                          value={params.depreciacao} onChange={set('depreciacao')}
                          hint="Reduz a valorização dos studios já comprados em relação aos lançamentos." />
              <ParamField label="Dissídio anual (salário e bônus)" kind="pct" min={0} max={15} step={0.5}
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
                          hint="Só serve para calcular o FGTS. Com saldo devedor no apê, a cada 2 anos ele abate o apê e a queda na parcela vira aporte mensal. Com o apê quitado, compra studio pronto à vista assim que FGTS + caixa livre fecham a conta." />
            </Group>

            <Group title="Horizonte">
              <ParamField label="Anos de simulação" kind="anos" min={1} max={30} step={1}
                          value={params.years} onChange={set('years')} />
            </Group>
          </div>

          <div className="grid gap-6 content-start min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Studios c/ chaves" value={String(final.studiosComChaves)} />
              <Stat label="Studios quitados" value={String(final.studiosQuitadosEquiv)} />
              <Stat label="Renda mensal líquida" value={formatBRLCompact(final.rendaMensalLiquida)} title={formatBRL(final.rendaMensalLiquida)} />
            </div>
            <PlannerChart points={pontos} />
            <PlannerLedger linhas={linhas} />
            <p className="text-[11px] text-muted leading-relaxed">
              Como o sistema compra: todo mês ele soma o saldo acumulado com as entradas e saídas previstas
              (aportes, aluguéis, parcelas, custos) e compra o studio com menos obra pela frente que essa conta
              paga até as chaves — sem deixar o saldo ficar negativo lá na frente. O que sobra é adiantado nas
              obras em andamento. Simulação educativa, não é recomendação de investimento.
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
