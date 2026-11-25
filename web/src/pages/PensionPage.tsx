import { useCallback, useEffect, useMemo } from 'react'
import { pensionApi } from '../pension/api'
import { simulate, simulateMonthly } from '../pension/calc'
import { DEFAULT_PARAMS, type PensionParams } from '../pension/types'
import { formatBRL, formatBRLCompact, formatPct } from '../planner/format'
import { ParamField } from './planner/ParamField'
import { PlanBar } from './plan/PlanBar'
import { usePlanSession } from './plan/usePlanSession'
import { ChoiceField } from './pension/ChoiceField'
import { CompanyBandsField } from './pension/CompanyBandsField'
import { PensionChart } from './pension/PensionChart'
import { PensionLedger } from './pension/PensionLedger'

/**
 * /previdencia-privada — simulador de PGBL/VGBL de um plano corporativo (salário, idade, contrapartida da
 * empresa por faixa etária). Abre para qualquer visitante, sem login, com os valores padrão que o
 * administrador escolheu; quem entra com o Google guarda o próprio plano, pelo uid (api/pension/). O cálculo
 * roda inteiro no navegador (pension/calc.ts); o backend só guarda e devolve os parâmetros. Sessão,
 * salvamento e edição dos padrões moram em `plan/usePlanSession`.
 */
export function PensionPage() {
  const plan = usePlanSession<PensionParams>({ makeApi: pensionApi, factory: DEFAULT_PARAMS })
  const { params, setParams } = plan

  useEffect(() => { document.title = 'Previdência Privada — Rodrigo Matheus' }, [])

  const set = useCallback(<K extends keyof PensionParams>(key: K) => (value: PensionParams[K]) =>
    setParams((p) => ({ ...p, [key]: value })), [setParams])

  const pontos = useMemo(() => simulate(params), [params])
  const linhas = useMemo(() => simulateMonthly(params), [params])
  const final = pontos.at(-1)!

  return (
    <Shell>
      <PlanBar title="PREVIDÊNCIA PRIVADA" plan={plan} />

      {!plan.ready ? (
        <p className="text-muted text-[13px]">Carregando…</p>
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

            <Group title="Você">
              <ParamField label="Idade atual" kind="anos" min={18} max={75} step={1}
                          value={params.idadeAtual} onChange={set('idadeAtual')}
                          hint="Decide em qual faixa de contrapartida da empresa você está a cada mês." />
              <ParamField label="Salário bruto" kind="brl" min={0} max={200_000} step={500}
                          value={params.salarioBruto} onChange={set('salarioBruto')} />
              <ParamField label="Dissídio anual (salário)" kind="pct" min={0} max={15} step={0.5}
                          value={params.dissidio} onChange={set('dissidio')} />
              <ParamField label="Mês do dissídio" kind="mes" min={1} max={12} step={1}
                          value={params.mesDissidio} onChange={set('mesDissidio')} />
            </Group>

            <Group title="Seus aportes">
              <ParamField label="Aporte básico" kind="pct" min={0} max={20} step={0.5}
                          value={params.aporteBasicoPct} onChange={set('aporteBasicoPct')}
                          hint="% do salário — recebe a contrapartida da empresa, pela faixa de idade abaixo." />
              <ParamField label="Aporte extra" kind="pct" min={0} max={20} step={0.5}
                          value={params.aporteExtraPct} onChange={set('aporteExtraPct')}
                          hint="% do salário, só do seu bolso — a empresa não contribui em cima dele." />
              <ParamField label="Já acumulado hoje" kind="brl" min={0} max={5_000_000} step={5_000}
                          value={params.initial} onChange={set('initial')} />
            </Group>

            <Group title="Contrapartida da empresa">
              <CompanyBandsField value={params.faixasEmpresa} onChange={set('faixasEmpresa')} />
            </Group>

            <Group title="O fundo">
              <ParamField label="Rendimento bruto do fundo" kind="pct" min={0} max={30} step={0.5}
                          value={params.rendimentoAnual} onChange={set('rendimentoAnual')} />
              <ParamField label="Taxa de administração" kind="pct" min={0} max={5} step={0.1}
                          value={params.taxaAdministracaoAnual} onChange={set('taxaAdministracaoAnual')} />
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
