import { useState } from 'react'
import { rotuloMesAno, type Inicio, dataDoMes } from '../../planner/calendario'
import { compararEstrategias, type Resultado } from '../../planner/estrategias'
import { formatBRL } from '../../planner/format'
import type { PlannerParams } from '../../planner/types'

const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/**
 * "Comparar estratégias": o mesmo plano, mudando uma coisa de cada vez. Não roda sozinho (são seis ou sete
 * simulações): só no clique, e avisa quando os campos mudaram depois.
 */
export function PlannerComparar({ params, inicio, moeda }: { params: PlannerParams; inicio: Inicio; moeda: 'hoje' | 'nominal' }) {
  const [res, setRes] = useState<{ itens: Resultado[]; usados: string } | null>(null)
  const atual = JSON.stringify(params)
  const defasado = res !== null && res.usados !== atual

  const dinheiro = (r: Resultado, tipo: 'patrimonio' | 'renda') =>
    moeda === 'hoje' ? (tipo === 'patrimonio' ? r.patrimonioFinalHoje : r.rendaDisponivelFinalHoje) : (tipo === 'patrimonio' ? r.patrimonioFinal : r.rendaDisponivelFinal)
  const viveEm = (r: Resultado) => {
    if (r.mesDaMeta === null) return 'não chega'
    const d = dataDoMes(r.mesDaMeta, inicio)
    return rotuloMesAno(d.ano, d.mesDoAno)
  }
  const maior = (tipo: 'patrimonio' | 'renda') => res ? Math.max(...res.itens.map((r) => dinheiro(r, tipo))) : 0
  const folego = (r: Resultado) => (r.piorFolegoMeses !== null && Number.isFinite(r.piorFolegoMeses) ? `${n1.format(r.piorFolegoMeses)} meses` : '—')
  const saldo = (r: Resultado) => (
    <>{formatBRL(r.menorSaldo)}{r.menorSaldo < 0 && <span className="text-muted"> · não fecha</span>}</>
  )

  return (
    <div className="panel hud-frame p-4 md:p-6 grid gap-3 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="hud-label">Comparar estratégias</div>
        <button type="button" className="cta cta-primary !py-2 font-display font-semibold text-[11px] uppercase tracking-wider"
                onClick={() => setRes({ itens: compararEstrategias(params, inicio), usados: atual })}>
          {res ? (defasado ? 'comparar de novo' : 'comparar') : 'comparar'}
        </button>
      </div>
      <p className="text-[11px] text-muted">
        O mesmo plano, mudando uma coisa de cada vez. O cenário ruim mostra quanto a sua estratégia aguenta.
      </p>
      {defasado && <p className="text-[12px] text-heading">Os números ao lado mudaram depois desta comparação.</p>}
      {res && (
        <>
          <div className="hidden md:block overflow-x-auto min-w-0">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 pr-3 font-normal">Estratégia</th>
                  <th className="py-1.5 pr-3 font-normal">Studios</th>
                  <th className="py-1.5 pr-3 font-normal">Patrimônio no fim</th>
                  <th className="py-1.5 pr-3 font-normal">Renda disponível no fim</th>
                  <th className="py-1.5 pr-3 font-normal">Vive de renda em</th>
                  <th className="py-1.5 pr-3 font-normal">Pico de dívida</th>
                  <th className="py-1.5 pr-3 font-normal">Menor fôlego</th>
                  <th className="py-1.5 font-normal">Menor saldo</th>
                </tr>
              </thead>
              <tbody>
                {res.itens.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3"><div className="text-heading">{r.nome}</div><div className="text-muted text-[11px]">{r.descricao}</div></td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.studios}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatBRL(dinheiro(r, 'patrimonio'))}{dinheiro(r, 'patrimonio') === maior('patrimonio') && <span className="text-muted"> · maior</span>}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatBRL(dinheiro(r, 'renda'))}{dinheiro(r, 'renda') === maior('renda') && <span className="text-muted"> · maior</span>}</td>
                    <td className="py-1.5 pr-3">{viveEm(r)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatBRL(r.picoDivida)}</td>
                    <td className="py-1.5 pr-3">{folego(r)}</td>
                    <td className="py-1.5 tabular-nums">{saldo(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden overflow-x-auto min-w-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 pr-2 font-normal">Estratégia</th>
                  <th className="py-1.5 pr-2 font-normal">Resultado</th>
                  <th className="py-1.5 font-normal">Risco</th>
                </tr>
              </thead>
              <tbody>
                {res.itens.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2"><div className="text-heading">{r.nome}</div></td>
                    <td className="py-1.5 pr-2">
                      <div>{formatBRL(dinheiro(r, 'patrimonio'))} <span className="text-muted">patrim.</span></div>
                      <div>{formatBRL(dinheiro(r, 'renda'))} <span className="text-muted">renda</span></div>
                      <div>{r.studios} <span className="text-muted">studios</span></div>
                      <div><span className="text-muted">vive em</span> {viveEm(r)}</div>
                    </td>
                    <td className="py-1.5">
                      <div>{formatBRL(r.picoDivida)} <span className="text-muted">dívida</span></div>
                      <div>{folego(r)} <span className="text-muted">fôlego</span></div>
                      <div>{saldo(r)} <span className="text-muted">saldo</span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
