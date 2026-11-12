import { roteiroAnual, type EstrategiaRodada } from '../../planner/caminhos'
import { formatBRL, formatBRLCompact } from '../../planner/format'

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

