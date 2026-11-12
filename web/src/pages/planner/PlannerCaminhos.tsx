import { roteiroAnual, type EstrategiaRodada, type IdEstrategia } from '../../planner/caminhos'
import { formatBRL, formatBRLCompact } from '../../planner/format'
import { ESTILO } from './PlannerChartEstrategias'

const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Qual estratégia rende mais no seu prazo, e por quê, com as quatro lado a lado. */
export function PlannerRecomendacao({ estrategias, recomendada, porque, selecionada, onSelecionar, anos, metaHoje }: {
  estrategias: EstrategiaRodada[]
  recomendada: IdEstrategia
  porque: string
  selecionada: IdEstrategia
  onSelecionar: (id: IdEstrategia) => void
  anos: number
  metaHoje: number
}) {
  const melhor = estrategias.find((e) => e.id === recomendada)!
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-4 min-w-0">
      <div>
        <div className="hud-label">O melhor caminho para você em {anos} anos</div>
        <p className="font-display font-bold text-[20px] text-heading mt-2">{melhor.nome}</p>
        <p className="text-[12px] text-muted leading-relaxed mt-1">{porque}</p>
      </div>
      <div className="overflow-x-auto min-w-0">
        <table className="w-full border-collapse text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal">Estratégia</th>
              <th className="py-1 pr-3 font-normal">Renda/mês no fim</th>
              <th className="py-1 pr-3 font-normal">Patrimônio</th>
              <th className="py-1 pr-3 font-normal">Studios</th>
              <th className="py-1 pr-3 font-normal">Cobre a meta</th>
              <th className="py-1 pr-3 font-normal">Maior dívida</th>
              <th className="py-1 font-normal">Menor caixa</th>
            </tr>
          </thead>
          <tbody>
            {estrategias.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="py-1.5 pr-3">
                  <button type="button" aria-pressed={e.id === selecionada} onClick={() => onSelecionar(e.id)}
                          className={`inline-flex items-center gap-2 hover:text-heading ${e.id === selecionada ? 'text-heading font-semibold' : 'text-muted'}`}>
                    <svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke={ESTILO[e.id].cor} strokeWidth="3" strokeDasharray={ESTILO[e.id].dash} /></svg>
                    {e.nome}{e.id === recomendada ? ' ★' : ''}
                  </button>
                </td>
                <td className="py-1.5 pr-3 text-heading tabular-nums">{formatBRL(e.resumo.rendaFinal)}</td>
                <td className="py-1.5 pr-3 text-heading tabular-nums">{formatBRLCompact(e.resumo.patrimonioFinal)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{e.resumo.studios}</td>
                <td className="py-1.5 pr-3">{metaHoje <= 0 ? '—' : e.resumo.mesDaMeta !== null ? `ano ${n1.format(e.resumo.mesDaMeta / 12)}` : 'não chega'}</td>
                <td className="py-1.5 pr-3 tabular-nums">{formatBRLCompact(e.resumo.picoDivida)}</td>
                <td className={`py-1.5 tabular-nums ${e.resumo.menorSaldo < -1 ? 'text-red' : ''}`}>{formatBRLCompact(e.resumo.menorSaldo)}{e.resumo.menorSaldo < -1 ? ' ⚠' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1 text-[11px] text-muted">
        {estrategias.map((e) => <li key={e.id}><strong className="text-heading">{e.nome}:</strong> {e.descricao}</li>)}
      </ul>
      <p className="text-[11px] text-muted">Valores em reais de hoje. ⚠ = o caixa fica negativo em algum mês: o plano não fecha com a sua margem. Simulação educativa, não é recomendação de investimento.</p>
    </div>
  )
}

/** O roteiro: onde você está no fim de cada ano e o que fez nele, na estratégia escolhida. */
export function PlannerRoteiro({ estrategia }: { estrategia: EstrategiaRodada }) {
  const rot = roteiroAnual(estrategia.linhas, estrategia.params)
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="hud-label">Roteiro ano a ano — {estrategia.nome}</div>
      <p className="text-[11px] text-muted">Renda e patrimônio no fim de cada ano, em reais de hoje, e o que aconteceu nele.</p>
      <div className="overflow-x-auto min-w-0 max-h-[420px] overflow-y-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal whitespace-nowrap">Ano</th>
              <th className="py-1 pr-3 font-normal whitespace-nowrap">Renda/mês</th>
              <th className="py-1 pr-3 font-normal whitespace-nowrap">Patrimônio</th>
              <th className="py-1 pr-3 font-normal">Studios</th>
              <th className="py-1 font-normal">O que aconteceu</th>
            </tr>
          </thead>
          <tbody>
            {rot.map((r) => (
              <tr key={r.ano} className="border-t border-line align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap text-heading">{r.ano} · {r.anoCalendario}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-heading">{formatBRL(r.rendaHoje)}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{formatBRLCompact(r.patrimonioHoje)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.studios}</td>
                <td className="py-1.5 text-muted">{r.destaques.length ? r.destaques.join(' · ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

