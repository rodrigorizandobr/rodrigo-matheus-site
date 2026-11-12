import { formatBRL } from '../../planner/format'
import type { MonthRow } from '../../planner/types'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const numero = new Intl.NumberFormat('pt-BR')
/** Valor compacto para célula estreita: sem o "R$" repetido — o cabeçalho já diz que é dinheiro. */
const curto = (v: number) => numero.format(v)

/** `breve` é o rótulo do mobile, onde cada caractere custa largura. */
type Linha = { rotulo: string; breve?: string; sinal?: '+' | '−'; valor: (l: MonthRow) => number }

/**
 * Tudo que entrou e saiu do CAIXA no mês, numa coluna só, um embaixo do outro e com
 * nome (pedido do PO, 2026-11-12) — a soma destas linhas é exatamente a variação da
 * coluna Saldo. Linha com valor zero não aparece.
 */
const MOVIMENTOS: Linha[] = [
  { sinal: '+', rotulo: 'aporte mensal', valor: (l) => l.aporteMensal },
  { sinal: '+', rotulo: 'aporte anual', valor: (l) => l.aporteAnual },
  { sinal: '+', rotulo: 'aluguéis recebidos', breve: 'aluguéis', valor: (l) => l.aluguelRecebido },
  { sinal: '+', rotulo: 'venda de studio', breve: 'venda', valor: (l) => l.valorVendas },
  { sinal: '+', rotulo: 'rendimento do caixa', breve: 'rendimento', valor: (l) => l.rendimentoCaixa },
  { sinal: '−', rotulo: 'custos dos imóveis', breve: 'custos', valor: (l) => l.custosImovel },
  { sinal: '−', rotulo: 'parcelas do financiamento', breve: 'parcelas', valor: (l) => l.totalParcelasFinanciamento },
  { sinal: '−', rotulo: 'pago nos studios (entrada, obra ou compra)', breve: 'pago nos studios', valor: (l) => l.comprasImoveis },
  { sinal: '−', rotulo: 'documentação (ITBI, cartório)', breve: 'documentação', valor: (l) => l.documentacao },
  { sinal: '−', rotulo: 'montagem (acabamento e mobília)', breve: 'montagem', valor: (l) => l.montagem },
  { sinal: '−', rotulo: 'custo fixo da holding', breve: 'holding', valor: (l) => l.custoFixoHolding },
  { sinal: '−', rotulo: 'amortização antecipada', breve: 'amortização', valor: (l) => l.amortizacaoExtra },
  { sinal: '−', rotulo: 'parcelas do consórcio', breve: 'consórcio', valor: (l) => l.parcelasConsorcio },
  { sinal: '−', rotulo: 'lance do consórcio', breve: 'lance', valor: (l) => l.lanceConsorcio },
  { sinal: '−', rotulo: 'parcela do apê', breve: 'apê', valor: (l) => l.parcelaApePaga },
  { sinal: '−', rotulo: 'retirada para viver', breve: 'retirada', valor: (l) => l.retirada },
]

/** O FGTS é uma conta à parte: não passa pelo caixa. O saldo do apê entra aqui por ser a dívida que o FGTS abate. */
const FGTS: Linha[] = [
  { rotulo: 'abateu o apê', valor: (l) => l.abatimentoApeFgts },
  { rotulo: 'comprou studio pronto', breve: 'comprou studio', valor: (l) => l.compraAVistaFgts },
  { rotulo: 'saldo', valor: (l) => l.saldoFgts },
  { rotulo: 'saldo do apê', breve: 'apê', valor: (l) => l.saldoApe },
]

const IMOVEIS: Linha[] = [
  { rotulo: 'em construção', valor: (l) => l.imoveisEmConstrucao },
  { rotulo: 'alugados', valor: (l) => l.imoveisAlugados },
  { rotulo: 'quitados', valor: (l) => l.imoveisQuitados },
  { rotulo: 'financiados', valor: (l) => l.imoveisFinanciados },
  { rotulo: 'vendidos no mês', breve: 'vendidos', valor: (l) => l.vendas },
  { rotulo: 'contemplados no mês', breve: 'contemplados', valor: (l) => l.contemplacoes },
  { rotulo: 'total', valor: (l) => l.totalImoveis },
]

const SO_NO_MOBILE = ['vendidos no mês', 'contemplados no mês']

function Empilhado({ linhas, l, formato, breve }: { linhas: Linha[]; l: MonthRow; formato: (v: number) => string; breve?: boolean }) {
  return (
    <>
      {linhas.filter((x) => x.valor(l) !== 0).map((x) => (
        <div key={x.rotulo}>
          <span className="text-heading">{x.sinal ? `${x.sinal} ` : ''}{formato(x.valor(l))}</span>
          <span className="text-muted"> {breve ? x.breve ?? x.rotulo : x.rotulo}</span>
        </div>
      ))}
    </>
  )
}

/**
 * Sempre TABELA, no desktop e no mobile — nunca cartão (o PO rejeitou cartão: quebra a
 * leitura "mesmo dado, um mês embaixo do outro"). As duas ficam no DOM; o CSS escolhe.
 */
export function PlannerLedger({ linhas }: { linhas: MonthRow[] }) {
  const colunasImoveis = IMOVEIS.filter((c) => !SO_NO_MOBILE.includes(c.rotulo))
  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="hud-label mb-1">Diário de bordo</div>
      <p className="text-[11px] text-muted mb-3">
        Um mês por linha, em valores nominais (da época), sem descontar a inflação. Saldo é o dinheiro em caixa que sobrou
        acumulado, depois das entradas e saídas do mês.
      </p>

      <div className="hidden md:block overflow-x-auto max-h-[480px] overflow-y-auto min-w-0">
        <table className="w-full border-collapse text-[12px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted sticky top-0 bg-surface">
              <th className="py-1.5 pr-3 font-normal">Ano</th>
              <th className="py-1.5 pr-3 font-normal">Mês</th>
              <th className="py-1.5 pr-4 font-normal">Entradas e saídas</th>
              <th className="py-1.5 pr-4 font-normal">FGTS e apê</th>
              {colunasImoveis.map((c) => (
                <th key={c.rotulo} className="py-1.5 pr-3 font-normal first-letter:uppercase">{c.rotulo}</th>
              ))}
              <th className="py-1.5 pr-3 font-normal">Saldo</th>
              <th className="py-1.5 font-normal">Patrimônio líquido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line align-top">
                <td className="py-1 pr-3 text-muted">{l.ano}</td>
                <td className="py-1 pr-3 text-muted">{MESES_ABREV[l.mesDoAno - 1]}</td>
                <td className="py-1 pr-4"><Empilhado linhas={MOVIMENTOS} l={l} formato={formatBRL} /></td>
                <td className="py-1 pr-4"><Empilhado linhas={FGTS} l={l} formato={formatBRL} /></td>
                {colunasImoveis.map((c) => (
                  <td key={c.rotulo} className="py-1 pr-3">{c.valor(l)}</td>
                ))}
                <td className="py-1 pr-3 font-semibold text-heading">{formatBRL(l.saldo)}</td>
                <td className="py-1 font-semibold text-heading">{formatBRL(l.patrimonioLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden overflow-x-auto max-h-[480px] overflow-y-auto min-w-0">
        <table className="w-full border-collapse text-[10px] whitespace-nowrap">
          <thead>
            <tr className="text-left text-muted sticky top-0 bg-surface">
              <th className="py-1.5 pr-2 font-normal">Mês</th>
              <th className="py-1.5 pr-2 font-normal">Entradas e saídas (R$)</th>
              <th className="py-1.5 pr-2 font-normal">Imóveis (nº)</th>
              <th className="py-1.5 font-normal">Saldos (R$)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 text-muted">
                  <div>{l.ano}</div>
                  <div>{MESES_ABREV[l.mesDoAno - 1]}</div>
                </td>
                <td className="py-1.5 pr-2">
                  <Empilhado linhas={MOVIMENTOS} l={l} formato={curto} breve />
                  <Empilhado linhas={FGTS.slice(0, 2).map((x) => ({ ...x, breve: `FGTS ${x.breve ?? x.rotulo}` }))} l={l} formato={curto} breve />
                </td>
                <td className="py-1.5 pr-2"><Empilhado linhas={IMOVEIS} l={l} formato={String} breve /></td>
                <td className="py-1.5">
                  <div><span className="font-semibold text-heading">{curto(l.saldo)}</span><span className="text-muted"> saldo</span></div>
                  <div><span className="text-heading">{curto(l.saldoFgts)}</span><span className="text-muted"> FGTS</span></div>
                  {l.saldoApe > 0 && <div><span className="text-heading">{curto(l.saldoApe)}</span><span className="text-muted"> apê</span></div>}
                  <div><span className="font-semibold text-heading">{curto(l.patrimonioLiquido)}</span><span className="text-muted"> patrim.</span></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
