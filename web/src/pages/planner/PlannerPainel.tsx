import { type EstrategiaRodada, type IdEstrategia } from '../../planner/caminhos'
import { emReaisDeHoje } from '../../planner/inflacao'
import { formatBRL, formatBRLCompact } from '../../planner/format'
import { ESTILO } from './PlannerChartEstrategias'

/** A resposta: onde colocar o dinheiro, e as quatro estratégias lado a lado com os mesmos cinco números. */
export function PlannerPainel({ estrategias, recomendada, porque, selecionada, onSelecionar, ipca, anos }: {
  estrategias: EstrategiaRodada[]
  recomendada: IdEstrategia
  porque: string
  selecionada: IdEstrategia
  onSelecionar: (id: IdEstrategia) => void
  ipca: number
  anos: number
}) {
  const melhor = estrategias.find((e) => e.id === recomendada)!
  return (
    <section className="grid gap-4 min-w-0" aria-label="Resultado">
      <div className="panel hud-frame p-4 md:p-6 min-w-0">
        <div className="hud-label">Onde colocar o seu dinheiro</div>
        <p className="font-display font-bold text-[24px] text-heading mt-1">{melhor.nome}</p>
        <p className="text-[12px] text-muted mt-1">{porque}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 min-w-0">
        {estrategias.map((e) => {
          const r = e.resumo
          const f = e.linhas.at(-1)!
          const nominalPatrimonio = f.patrimonioLiquido
          const nominalRenda = f.rendaDisponivel
          const ruim = r.menorSaldo < -1
          return (
            <button key={e.id} type="button" onClick={() => onSelecionar(e.id)} aria-pressed={e.id === selecionada}
                    aria-label={`${e.nome}${e.id === recomendada ? ' (recomendada)' : ''}`}
                    className={`panel p-4 text-left grid gap-2 min-w-0 ${e.id === selecionada ? 'neon-red' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-display font-semibold text-heading text-[14px]">
                  <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={ESTILO[e.id].cor} strokeWidth="3" strokeDasharray={ESTILO[e.id].dash} /></svg>
                  {e.nome}
                </span>
                {e.id === recomendada && <span className="text-[10px] uppercase tracking-wider text-red font-display font-semibold">★ melhor</span>}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-muted">Imóveis no fim</dt><dd className="text-heading font-semibold tabular-nums text-right">{r.studios}</dd>
                <dt className="text-muted">Aluguel por mês</dt><dd className="text-heading tabular-nums text-right">{formatBRL(r.aluguelFinal)}</dd>
                <dt className="text-muted">Gastos por mês</dt><dd className="text-heading tabular-nums text-right">− {formatBRL(r.gastosFinal)}</dd>
                <dt className="text-muted">Renda por mês</dt>
                <dd className="text-heading font-semibold tabular-nums text-right">{formatBRL(r.rendaFinal)}
                  <span className="block text-[10px] text-muted font-normal">nominal {formatBRLCompact(nominalRenda)}</span></dd>
                <dt className="text-muted">Patrimônio</dt>
                <dd className="text-heading font-semibold tabular-nums text-right">{formatBRLCompact(r.patrimonioFinal)}
                  <span className="block text-[10px] text-muted font-normal">nominal {formatBRLCompact(nominalPatrimonio)}</span></dd>
              </dl>
              {ruim && <p className="text-[11px] text-red">⚠ O caixa fica negativo em algum mês: não fecha com os seus aportes.</p>}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted">
        Em {anos} anos, em reais de hoje (IPCA {String(ipca).replace('.', ',')}% a.a.); o valor nominal vai embaixo, em cinza. Renda = aluguel menos gastos
        (parcelas, impostos, condomínio, imobiliária, manutenção). Simulação educativa, não é recomendação de investimento.
      </p>
    </section>
  )
}

/** Uma tabela só: renda por mês e patrimônio, ano a ano, das quatro estratégias. */
export function PlannerAnoAno({ estrategias, recomendada, ipca }: { estrategias: EstrategiaRodada[]; recomendada: IdEstrategia; ipca: number }) {
  const anos = Math.floor(estrategias[0].linhas.length / 12)
  const linhaDe = (e: EstrategiaRodada, a: number) => {
    const l = e.linhas[a * 12 - 1]
    return { renda: emReaisDeHoje(l.rendaDisponivel, l.mes, ipca), patrimonio: emReaisDeHoje(l.patrimonioLiquido, l.mes, ipca), imoveis: l.totalImoveis }
  }
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="hud-label">Ano a ano <span className="normal-case tracking-normal text-muted">· renda por mês, patrimônio e imóveis, em R$ de hoje</span></div>
      <div className="overflow-x-auto min-w-0 max-h-[420px] overflow-y-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal">Ano</th>
              {estrategias.map((e) => <th key={e.id} className="py-1 pr-3 font-normal whitespace-nowrap">{e.nome}{e.id === recomendada ? ' ★' : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: anos }, (_, i) => i + 1).map((a) => (
              <tr key={a} className="border-t border-line align-top">
                <td className="py-1.5 pr-3 text-heading tabular-nums">{a}</td>
                {estrategias.map((e) => {
                  const v = linhaDe(e, a)
                  return (
                    <td key={e.id} className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                      <span className="text-heading">{formatBRL(v.renda)}</span>
                      <span className="block text-[10px] text-muted">{formatBRLCompact(v.patrimonio)} · {v.imoveis} imóv.</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
