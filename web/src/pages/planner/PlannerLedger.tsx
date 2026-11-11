import { formatBRL } from '../../planner/format'
import type { MonthRow } from '../../planner/types'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Diário de bordo: uma linha por mês, com tudo que se moveu naquele mês. */
export function PlannerLedger({ linhas }: { linhas: MonthRow[] }) {
  return (
    <div className="panel hud-frame p-4 md:p-6">
      <div className="hud-label mb-1">Diário de bordo</div>
      <p className="text-[11px] text-muted mb-3">Um mês por linha, do mês 1 ao fim do horizonte.</p>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full border-collapse text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted sticky top-0 bg-surface">
              <th className="py-1.5 pr-3 font-normal">Ano</th>
              <th className="py-1.5 pr-3 font-normal">Mês</th>
              <th className="py-1.5 pr-3 font-normal">Aporte mensal</th>
              <th className="py-1.5 pr-3 font-normal">Aporte anual</th>
              <th className="py-1.5 pr-3 font-normal">Abatimento apê (FGTS)</th>
              <th className="py-1.5 pr-3 font-normal">Compra à vista (FGTS)</th>
              <th className="py-1.5 pr-3 font-normal">Saldo do FGTS</th>
              <th className="py-1.5 pr-3 font-normal">Em construção</th>
              <th className="py-1.5 pr-3 font-normal">Alugados</th>
              <th className="py-1.5 pr-3 font-normal">Quitados</th>
              <th className="py-1.5 pr-3 font-normal">Financiados</th>
              <th className="py-1.5 pr-3 font-normal">Total de imóveis</th>
              <th className="py-1.5 pr-3 font-normal">Parcelas dos imóveis</th>
              <th className="py-1.5 pr-3 font-normal">Renda do mês</th>
              <th className="py-1.5 font-normal">Patrimônio líquido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line">
                <td className="py-1 pr-3 text-muted">{l.anoDoPlano}</td>
                <td className="py-1 pr-3 text-muted">{MESES_ABREV[l.mesDoAno - 1]}</td>
                <td className="py-1 pr-3">{formatBRL(l.aporteMensal)}</td>
                <td className="py-1 pr-3">{l.aporteAnual > 0 ? formatBRL(l.aporteAnual) : '—'}</td>
                <td className="py-1 pr-3">{l.abatimentoApeFgts > 0 ? formatBRL(l.abatimentoApeFgts) : '—'}</td>
                <td className="py-1 pr-3">{l.compraAVistaFgts > 0 ? formatBRL(l.compraAVistaFgts) : '—'}</td>
                <td className="py-1 pr-3">{formatBRL(l.saldoFgts)}</td>
                <td className="py-1 pr-3 text-center">{l.imoveisEmConstrucao}</td>
                <td className="py-1 pr-3 text-center">{l.imoveisAlugados}</td>
                <td className="py-1 pr-3 text-center">{l.imoveisQuitados}</td>
                <td className="py-1 pr-3 text-center">{l.imoveisFinanciados}</td>
                <td className="py-1 pr-3 text-center font-semibold text-heading">{l.totalImoveis}</td>
                <td className="py-1 pr-3">{formatBRL(l.totalParcelasFinanciamento)}</td>
                <td className="py-1 pr-3">{formatBRL(l.rendaMensalLiquida)}</td>
                <td className="py-1 font-semibold text-heading">{formatBRL(l.patrimonioLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
