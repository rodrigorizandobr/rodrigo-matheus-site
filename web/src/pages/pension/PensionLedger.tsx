import { formatBRL } from '../../planner/format'
import type { PensionMonthRow } from '../../pension/types'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const numero = new Intl.NumberFormat('pt-BR')
/** Valor compacto para célula estreita: sem o "R$" repetido em toda linha — o cabeçalho do
 * grupo já diz que é dinheiro. */
const curto = (v: number) => numero.format(v)

const COLUNAS: { rotulo: string; valor: (l: PensionMonthRow) => string }[] = [
  { rotulo: 'Aporte mensal', valor: (l) => formatBRL(l.aporteMensal) },
  { rotulo: 'Aporte anual', valor: (l) => (l.aporteAnual > 0 ? formatBRL(l.aporteAnual) : '—') },
  { rotulo: 'Restituição PGBL', valor: (l) => (l.restituicaoPgbl > 0 ? formatBRL(l.restituicaoPgbl) : '—') },
  { rotulo: 'Abatimento apê (FGTS)', valor: (l) => (l.abatimentoApeFgts > 0 ? formatBRL(l.abatimentoApeFgts) : '—') },
  { rotulo: 'Aporte extra (FGTS)', valor: (l) => (l.aporteFgtsExtra > 0 ? formatBRL(l.aporteFgtsExtra) : '—') },
  { rotulo: 'Saldo do FGTS', valor: (l) => formatBRL(l.saldoFgts) },
  { rotulo: 'Saldo bruto', valor: (l) => formatBRL(l.saldoBruto) },
  { rotulo: 'Rendimento do mês', valor: (l) => formatBRL(l.rendimentoDoMes) },
]

/**
 * Mesmo desenho do diário de bordo do "Vivendo de Imóveis" (`PlannerLedger`):
 * tabela nos dois tamanhos de tela, nunca cartão — grupos relacionados viram
 * uma coluna só no mobile, empilhados dentro da célula, e só o que aconteceu
 * naquele mês aparece (sem "—" ocupando linha à toa).
 */
const GRUPOS_MOBILE: { cabecalho: string; linhas: { rotulo: string; valor: (l: PensionMonthRow) => string }[] }[] = [
  {
    cabecalho: 'Aportes/FGTS (R$)',
    linhas: [
      { rotulo: 'mensal', valor: (l) => curto(l.aporteMensal) },
      { rotulo: 'anual', valor: (l) => (l.aporteAnual > 0 ? curto(l.aporteAnual) : '—') },
      { rotulo: 'restituição PGBL', valor: (l) => (l.restituicaoPgbl > 0 ? curto(l.restituicaoPgbl) : '—') },
      { rotulo: 'abate apê', valor: (l) => (l.abatimentoApeFgts > 0 ? curto(l.abatimentoApeFgts) : '—') },
      { rotulo: 'extra FGTS', valor: (l) => (l.aporteFgtsExtra > 0 ? curto(l.aporteFgtsExtra) : '—') },
      { rotulo: 'saldo FGTS', valor: (l) => curto(l.saldoFgts) },
    ],
  },
  {
    cabecalho: 'Previdência (R$)',
    linhas: [
      { rotulo: 'saldo bruto', valor: (l) => curto(l.saldoBruto) },
      { rotulo: 'rendimento', valor: (l) => curto(l.rendimentoDoMes) },
    ],
  },
]

export function PensionLedger({ linhas }: { linhas: PensionMonthRow[] }) {
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
              <th className="py-1.5 font-normal">Saldo líquido estimado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line">
                <td className="py-1 pr-3 text-muted">{l.anoDoPlano}</td>
                <td className="py-1 pr-3 text-muted">{MESES_ABREV[l.mesDoAno - 1]}</td>
                {COLUNAS.map((c) => <td key={c.rotulo} className="py-1 pr-3">{c.valor(l)}</td>)}
                <td className="py-1 font-semibold text-heading">{formatBRL(l.saldoLiquidoEstimado)}</td>
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
              <th className="py-1.5 font-normal">Líquido (R$)</th>
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
                    {g.linhas.filter((sub) => sub.valor(l) !== '—').map((sub) => (
                      <div key={sub.rotulo}>
                        <span className="text-muted">{sub.rotulo} </span>
                        <span className="text-heading">{sub.valor(l)}</span>
                      </div>
                    ))}
                  </td>
                ))}
                <td className="py-1.5 font-semibold text-heading">{curto(l.saldoLiquidoEstimado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
