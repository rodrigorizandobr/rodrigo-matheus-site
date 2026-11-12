import { useState } from 'react'
import { contaDoAluguel } from '../../planner/calc'
import { rotuloMesAno } from '../../planner/calendario'
import { formatBRL, formatBRLCompact } from '../../planner/format'
import { alavancagem, cobertura, estresse, spreadAlavancagem } from '../../planner/indicadores'
import { posChavesPct } from '../../planner/contrato'
import { comparaLocacao } from '../../planner/temporada'
import type { Aviso } from '../../planner/avisos'
import type { MonthRow, PlannerParams } from '../../planner/types'

const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function Stat({ label, value, title, apoio }: { label: string; value: string; title?: string; apoio?: string }) {
  return (
    <div className="panel hud-frame p-4 text-center min-w-0" title={title}>
      <div className="font-display font-bold text-[22px] text-heading tabular-nums">{value}</div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
      {apoio && <div className="text-[11px] text-muted mt-1">{apoio}</div>}
    </div>
  )
}

/** Os avisos da tela. Sem aviso, o painel não aparece; o nível nunca é dito só por cor. */
export function PlannerAvisos({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null
  return (
    <details open className="panel hud-frame p-4 md:p-5 min-w-0">
      <summary className="hud-label cursor-pointer">Atenção ({avisos.length})</summary>
      <div className="grid gap-2.5 mt-3">
        {avisos.map((a) => (
          <p key={a.id} className="text-[12px] text-muted leading-relaxed">
            <strong className="text-heading">{a.nivel === 'atencao' ? 'Atenção:' : 'Saiba:'}</strong> {a.texto}
          </p>
        ))}
      </div>
    </details>
  )
}

const NOVIDADES = {
  id: '2026-11-realismo-2',
  itens: [
    'Os resultados agora aparecem em reais de hoje (dá para ver o valor nominal na chave acima dos cartões).',
    'Depois da transição você passa a retirar a sua meta de renda; antes, todo aluguel era reinvestido. Dá para voltar em Viver de renda.',
    'O plano investidor da construtora tem cronograma próprio (entrada, mensais, reforços, chaves e o resto sem juros): corrigido pelo INCC até as chaves e pelo IPCA depois, com o sistema dividindo mensais e reforços pelo seu fluxo.',
    'O apê amortiza todo mês, o caixa parado rende, e cada studio tem custo de montagem e um tempo até alugar; a holding tem custo fixo mensal.',
    'O imposto do aluguel segue o calendário da reforma tributária, e o gráfico compara com os mesmos aportes na renda fixa.',
    'Novos: reserva mínima de caixa, teste de estresse, temporada (Airbnb), consórcio, ágio do pronto, venda nas chaves e comparação de estratégias.',
    'Os valores sugeridos de aluguel, INCC e juros foram atualizados para novembro de 2026 (centro de São Paulo) — o que você já tinha gravado não muda.',
  ],
} as const

const CHAVE_NOVIDADES = 'planner:novidades'

function jaViu(): boolean {
  try { return window.localStorage.getItem(CHAVE_NOVIDADES) === NOVIDADES.id } catch { return false }
}

export function Novidades() {
  const [visto, setVisto] = useState(jaViu)
  if (visto) return null
  return (
    <div className="panel hud-frame p-4 md:p-5 grid gap-3 min-w-0">
      <div className="hud-label">O simulador ficou mais realista</div>
      <ul className="grid gap-1.5 text-[12px] text-muted list-disc pl-4">
        {NOVIDADES.itens.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <button type="button" className="chip !h-8 justify-self-start font-display font-semibold text-[11px] uppercase tracking-wider"
              onClick={() => {
                try { window.localStorage.setItem(CHAVE_NOVIDADES, NOVIDADES.id) } catch { /* sem armazenamento: some até recarregar */ }
                setVisto(true)
              }}>
        entendi
      </button>
    </div>
  )
}

/** "Vale parcelar com a construtora?": o retorno do studio contra o custo da dívida (a correção do INCC). */
export function ValeFinanciar({ p, linhas }: { p: PlannerParams; linhas: MonthRow[] }) {
  const ultima = linhas.at(-1)
  if (!ultima) return null
  const s = spreadAlavancagem(p, ultima.ano)
  const parcela = posChavesPct(p)
  const alav = alavancagem(ultima)
  const cob = cobertura(ultima)
  const fecho = ultima.totalParcelasFinanciamento > 0 && cob !== null
    ? `No fim do plano a dívida é ${n1.format(alav * 100)}% do valor dos imóveis e os aluguéis cobrem ${n1.format(cob)} vezes as parcelas.`
    : 'No fim do plano não há parcelas a pagar.'
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-2 min-w-0">
      <div className="hud-label">Vale parcelar com a construtora?</div>
      {parcela === 0 ? (
        <p className="text-[12px] text-muted">Você paga tudo até as chaves: não há dívida com a construtora.</p>
      ) : s.spread >= 0 ? (
        <p className="text-[12px] text-muted leading-relaxed">
          <strong className="text-heading">Sim.</strong> O studio rende <strong className="text-heading">{n1.format(s.retornoImovel)}% a.a.</strong>{' '}
          ({n1.format(s.retornoAluguel)}% de aluguel líquido + {n1.format(s.valorizacao)}% de valorização) e a dívida custa só{' '}
          <strong className="text-heading">{n1.format(s.custoCredito)}% a.a.</strong> (a correção do IPCA depois das chaves, sem juros): cada R$ 100 parcelados somam cerca de R$ {n1.format(s.spread)} por ano.
        </p>
      ) : (
        <p className="text-[12px] text-muted leading-relaxed">
          <strong className="text-heading">Hoje não.</strong> O studio rende <strong className="text-heading">{n1.format(s.retornoImovel)}% a.a.</strong>{' '}
          ({n1.format(s.retornoAluguel)}% de aluguel líquido + {n1.format(s.valorizacao)}% de valorização) e a dívida custa{' '}
          <strong className="text-heading">{n1.format(s.custoCredito)}% a.a.</strong> de correção do IPCA. Cada R$ 100 parcelados tiram cerca de R$ {n1.format(-s.spread)} por ano do seu patrimônio.
        </p>
      )}
      <p className="text-[12px] text-muted">{fecho}</p>
    </div>
  )
}

/** "E se nenhum studio render?": quanto o caixa aguenta e quanto os aluguéis cobrem das obrigações. */
export function TesteDeEstresse({ linhas, reservaMeses, moeda }: {
  linhas: MonthRow[]
  reservaMeses: number
  moeda: (valor: number, mes: number) => number
}) {
  const e = estresse(linhas)
  if (!e.piorFolego && !e.piorCobertura && !e.picoObrigacoes) return null
  const quando = (mes: number | undefined) => {
    const l = linhas.find((x) => x.mes === mes)
    return l ? rotuloMesAno(l.ano, l.mesDoAno) : '—'
  }
  const folego = e.piorFolego && Number.isFinite(e.piorFolego.meses) ? `${n1.format(e.piorFolego.meses)} meses` : '—'
  const cob = e.piorCobertura && Number.isFinite(e.piorCobertura.razao) ? `${n1.format(e.piorCobertura.razao)}×` : '—'
  const referencia = reservaMeses > 0 ? reservaMeses : 3
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="hud-label">Teste de estresse</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Menor fôlego de caixa" value={folego} apoio={e.piorFolego ? `em ${quando(e.piorFolego.mes)}: quanto o caixa paga sem nenhum aluguel` : undefined} />
        <Stat label="Pior cobertura das obrigações" value={cob} apoio={e.piorCobertura ? `em ${quando(e.piorCobertura.mes)}: aluguéis e aporte contra parcelas` : undefined} />
        <Stat label="Maior obrigação mensal" value={e.picoObrigacoes ? formatBRLCompact(moeda(e.picoObrigacoes.valor, e.picoObrigacoes.mes)) : '—'}
              apoio={e.picoObrigacoes ? `em ${quando(e.picoObrigacoes.mes)}` : undefined}
              title={e.picoObrigacoes ? formatBRL(moeda(e.picoObrigacoes.valor, e.picoObrigacoes.mes)) : undefined} />
      </div>
      {e.piorFolego && Number.isFinite(e.piorFolego.meses) && (
        <p className="text-[12px] text-muted">
          Se nenhum studio render a partir de {quando(e.piorFolego.mes)}, o caixa aguenta {n1.format(e.piorFolego.meses)} meses de obrigações.
          O ideal é ter pelo menos {referencia}{reservaMeses > 0 ? ' (a sua reserva mínima)' : ''}.
        </p>
      )}
    </div>
  )
}

/** Aluguel tradicional contra temporada num studio de hoje, e a ocupação em que eles empatam. */
export function TradicionalTemporada({ p, ano }: { p: PlannerParams; ano: number }) {
  const c = comparaLocacao(p, (v) => contaDoAluguel(v, p, ano))
  const linha = (rotulo: string, a: number, b: number) => (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-3 text-muted">{rotulo}</td>
      <td className="py-1.5 pr-3 text-heading tabular-nums">{formatBRL(a)}</td>
      <td className="py-1.5 text-heading tabular-nums">{formatBRL(b)}</td>
    </tr>
  )
  const sobraAno = (liquido: number) => `${n1.format((12 * liquido / p.custoStudio) * 100)}%`
  const eq = c.ocupacaoDeEquilibrio
  const frase = eq <= 0
    ? 'A temporada ganha do aluguel tradicional com qualquer ocupação.'
    : eq > 100 || !Number.isFinite(eq)
      ? 'Com estas taxas a temporada não alcança o aluguel tradicional nem com a casa sempre cheia.'
      : `A temporada empata com o aluguel tradicional a ${n1.format(eq)}% de ocupação. Você informou ${n1.format(p.ocupacaoPct)}%.`
  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="hud-label">Tradicional × temporada</div>
      <p className="text-[11px] text-muted">Um studio de {formatBRL(p.custoStudio)}, por mês, em reais de hoje.</p>
      <div className="overflow-x-auto min-w-0">
        <table className="w-full border-collapse text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-normal"> </th>
              <th className="py-1 pr-3 font-normal">Tradicional</th>
              <th className="py-1 font-normal">Temporada</th>
            </tr>
          </thead>
          <tbody>
            {linha('Receita no mês', c.longa.bruto, c.temporada.bruto)}
            {linha('Custos e impostos', c.longa.custos, c.temporada.custos)}
            {linha('Sobra no mês', c.longa.liquido, c.temporada.liquido)}
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-muted">Sobra ao ano sobre o valor</td>
              <td className="py-1.5 pr-3 text-heading tabular-nums">{sobraAno(c.longa.liquido)}</td>
              <td className="py-1.5 text-heading tabular-nums">{sobraAno(c.temporada.liquido)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">{frase}</p>
    </div>
  )
}
