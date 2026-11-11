import { formatBRL } from '../../planner/format'
import type { MonthRow } from '../../planner/types'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const numero = new Intl.NumberFormat('pt-BR')
/** Valor compacto para célula estreita: sem o "R$" repetido em toda linha — o cabeçalho do
 * grupo já diz que é dinheiro. */
const curto = (v: number) => numero.format(v)

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
 * No mobile continua TABELA — não cartão: cartão quebra a leitura "mesmo tipo de dado,
 * uma linha por mês" que uma tabela dá de graça (pedido do PO, 2026-11-20, depois de ver
 * a versão em cartão: "não é útil como a tabela que vejo os mesmos tipos de dados um
 * abaixo do outro"). O que muda é só o número de colunas: grupos relacionados (os dois
 * aportes, os três números do FGTS, os cinco status de imóvel, parcela+renda) viram UMA
 * coluna cada, com os valores empilhados dentro da célula — "menos colunas, mais de uma
 * informação em algumas, uma abaixo da outra", exatamente como pedido.
 */
const GRUPOS_MOBILE: { cabecalho: string; linhas: { rotulo: string; valor: (l: MonthRow) => string }[] }[] = [
  {
    cabecalho: 'Aportes (R$)',
    linhas: [
      { rotulo: 'mensal', valor: (l) => curto(l.aporteMensal) },
      { rotulo: 'anual', valor: (l) => (l.aporteAnual > 0 ? curto(l.aporteAnual) : '—') },
    ],
  },
  {
    cabecalho: 'FGTS (R$)',
    linhas: [
      { rotulo: 'abate apê', valor: (l) => (l.abatimentoApeFgts > 0 ? curto(l.abatimentoApeFgts) : '—') },
      { rotulo: 'à vista', valor: (l) => (l.compraAVistaFgts > 0 ? curto(l.compraAVistaFgts) : '—') },
      { rotulo: 'saldo', valor: (l) => curto(l.saldoFgts) },
    ],
  },
  {
    cabecalho: 'Imóveis (nº)',
    linhas: [
      { rotulo: 'construção', valor: (l) => String(l.imoveisEmConstrucao) },
      { rotulo: 'alugados', valor: (l) => String(l.imoveisAlugados) },
      { rotulo: 'quitados', valor: (l) => String(l.imoveisQuitados) },
      { rotulo: 'financiados', valor: (l) => String(l.imoveisFinanciados) },
      { rotulo: 'total', valor: (l) => String(l.totalImoveis) },
    ],
  },
  {
    cabecalho: 'Financeiro (R$)',
    linhas: [
      { rotulo: 'parcelas', valor: (l) => curto(l.totalParcelasFinanciamento) },
      { rotulo: 'renda', valor: (l) => curto(l.rendaMensalLiquida) },
    ],
  },
]

export function PlannerLedger({ linhas }: { linhas: MonthRow[] }) {
  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="hud-label mb-1">Diário de bordo</div>
      <p className="text-[11px] text-muted mb-3">Um mês por linha, do mês 1 ao fim do horizonte.</p>

      {/* Desktop/tablet: uma coluna por tipo de dado. */}
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

      {/* Mobile: menos colunas, grupos relacionados empilhados dentro da mesma célula. */}
      <div className="md:hidden overflow-x-auto max-h-[480px] overflow-y-auto min-w-0">
        <table className="w-full border-collapse text-[10px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted sticky top-0 bg-surface">
              <th className="py-1.5 pr-2 font-normal">Mês</th>
              {GRUPOS_MOBILE.map((g) => <th key={g.cabecalho} className="py-1.5 pr-2 font-normal">{g.cabecalho}</th>)}
              <th className="py-1.5 font-normal">Patrim. (R$)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 text-muted">
                  <div>{l.anoDoPlano}</div>
                  <div>{MESES_ABREV[l.mesDoAno - 1]}</div>
                </td>
                {GRUPOS_MOBILE.map((g) => (
                  <td key={g.cabecalho} className="py-1.5 pr-2">
                    {g.linhas.map((sub) => (
                      <div key={sub.rotulo}>
                        <span className="text-muted">{sub.rotulo} </span>
                        <span className="text-heading">{sub.valor(l)}</span>
                      </div>
                    ))}
                  </td>
                ))}
                <td className="py-1.5 font-semibold text-heading">{curto(l.patrimonioLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
