import { formatBRL } from '../../planner/format'
import type { MonthRow } from '../../planner/types'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const COLUNAS: { rotulo: string; valor: (l: MonthRow) => string }[] = [
  { rotulo: 'Aporte mensal', valor: (l) => formatBRL(l.aporteMensal) },
  { rotulo: 'Aporte anual', valor: (l) => (l.aporteAnual > 0 ? formatBRL(l.aporteAnual) : '—') },
  { rotulo: 'Abatimento apê (FGTS)', valor: (l) => (l.abatimentoApeFgts > 0 ? formatBRL(l.abatimentoApeFgts) : '—') },
  { rotulo: 'Compra à vista (FGTS)', valor: (l) => (l.compraAVistaFgts > 0 ? formatBRL(l.compraAVistaFgts) : '—') },
  { rotulo: 'Saldo do FGTS', valor: (l) => formatBRL(l.saldoFgts) },
  { rotulo: 'Em construção', valor: (l) => String(l.imoveisEmConstrucao) },
  { rotulo: 'Alugados', valor: (l) => String(l.imoveisAlugados) },
  { rotulo: 'Quitados', valor: (l) => String(l.imoveisQuitados) },
  { rotulo: 'Financiados', valor: (l) => String(l.imoveisFinanciados) },
  { rotulo: 'Total de imóveis', valor: (l) => String(l.totalImoveis) },
  { rotulo: 'Parcelas dos imóveis', valor: (l) => formatBRL(l.totalParcelasFinanciamento) },
  { rotulo: 'Renda do mês', valor: (l) => formatBRL(l.rendaMensalLiquida) },
]

/**
 * Diário de bordo: uma linha por mês, com tudo que se moveu naquele mês. Tabela a
 * partir de `md`; abaixo disso 15 colunas não cabem em tela de celular nem rolando
 * de lado (texto minúsculo, sem como relacionar rótulo e valor) — vira uma lista de
 * cartões, um por mês, rótulo:valor empilhado.
 *
 * `min-w-0` em volta de `overflow-x-auto` não é enfeite: sem isso, dentro de um
 * grid o item nunca encolhe abaixo do tamanho do próprio conteúdo (aqui, a tabela
 * inteira) — a rolagem interna nunca entra em ação e é a PÁGINA que vaza pra
 * direita, cartões e sliders inclusive, porque todos dividem a mesma trilha do grid.
 */
export function PlannerLedger({ linhas }: { linhas: MonthRow[] }) {
  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="hud-label mb-1">Diário de bordo</div>
      <p className="text-[11px] text-muted mb-3">Um mês por linha, do mês 1 ao fim do horizonte.</p>

      <div className="hidden md:block overflow-x-auto max-h-[480px] overflow-y-auto min-w-0">
        <table className="w-full border-collapse text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted sticky top-0 bg-surface">
              <th className="py-1.5 pr-3 font-normal">Ano</th>
              <th className="py-1.5 pr-3 font-normal">Mês</th>
              {COLUNAS.map((c) => <th key={c.rotulo} className="py-1.5 pr-3 font-normal">{c.rotulo}</th>)}
              <th className="py-1.5 font-normal">Patrimônio líquido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line">
                <td className="py-1 pr-3 text-muted">{l.anoDoPlano}</td>
                <td className="py-1 pr-3 text-muted">{MESES_ABREV[l.mesDoAno - 1]}</td>
                {COLUNAS.map((c) => <td key={c.rotulo} className="py-1 pr-3">{c.valor(l)}</td>)}
                <td className="py-1 font-semibold text-heading">{formatBRL(l.patrimonioLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden grid gap-3 max-h-[480px] overflow-y-auto pr-1">
        {linhas.map((l) => (
          <div key={l.mes} className="panel p-3 grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display font-semibold text-heading text-[12px]">
                Ano {l.anoDoPlano} · {MESES_ABREV[l.mesDoAno - 1]}
              </span>
              <span className="font-display font-semibold text-heading text-[13px] tabular-nums">
                {formatBRL(l.patrimonioLiquido)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              {COLUNAS.map((c) => (
                <div key={c.rotulo} className="min-w-0">
                  <dt className="text-muted text-[10px] uppercase tracking-wide truncate">{c.rotulo}</dt>
                  <dd className="text-heading tabular-nums">{c.valor(l)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
