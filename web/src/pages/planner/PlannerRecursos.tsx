import { margemLivre } from '../../planner/caminhos'
import { formatBRL } from '../../planner/format'
import type { PlannerParams } from '../../planner/types'

const n0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** O ponto de partida: o que sobra todo mês, de verdade, do salário, do bônus e do financiamento da casa. */
export function PlannerRecursos({ p, onUsarComoAporte }: { p: PlannerParams; onUsarComoAporte: (valor: number) => void }) {
  const m = margemLivre(p)
  const sugerido = Math.max(0, Math.round(m.margemMensal / 100) * 100)
  const diferente = m.informado && sugerido !== p.monthlyAmount
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="hud-label">Sua margem livre</div>
      {!m.informado ? (
        <p className="text-[12px] text-muted leading-relaxed">
          Informe o salário líquido e as despesas no primeiro grupo da coluna à esquerda para ver quanto sobra de verdade.
          Enquanto isso, a margem é o aporte que você definiu: {formatBRL(p.monthlyAmount)} por mês e {formatBRL(p.annualAmount)} por ano.
        </p>
      ) : (
        <div className="grid gap-1 text-[12px]">
          <Linha rotulo="Salário líquido" valor={m.salarioLiquido} />
          <Linha rotulo="Financiamento da casa onde você mora" valor={-m.parcelaApe} />
          <Linha rotulo="Despesas do mês" valor={-m.despesas} />
          <Linha rotulo="Sobra por mês" valor={m.margemMensal} forte />
          <Linha rotulo="Bônus anual, diluído por mês" valor={m.bonusPorMes} />
          <Linha rotulo="Margem livre total por mês" valor={m.margemTotalMensal} forte />
          <p className="text-muted mt-1">
            {n0.format(m.comprometidoPct)}% do líquido já está comprometido com a casa e as despesas.
            {m.margemMensal < 0 && <strong className="text-red"> As despesas passam do que você ganha: não sobra nada para investir.</strong>}
          </p>
          {diferente && (
            <button type="button" className="chip !h-8 justify-self-start font-display font-semibold text-[11px] uppercase tracking-wider mt-1"
                    onClick={() => onUsarComoAporte(sugerido)}>
              Usar {formatBRL(sugerido)} como aporte mensal
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={forte ? 'text-heading font-semibold' : 'text-muted'}>{rotulo}</span>
      <span className={`tabular-nums ${forte ? 'font-display font-semibold text-heading' : 'text-heading'} ${valor < 0 ? 'text-red' : ''}`}>{formatBRL(valor)}</span>
    </div>
  )
}
