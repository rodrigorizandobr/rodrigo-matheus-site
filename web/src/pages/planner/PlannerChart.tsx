import { useMemo, useState } from 'react'
import type { YearPoint } from '../../planner/types'
import { formatBRL, formatBRLCompact } from '../../planner/format'

const W = 640
const H = 280
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

/**
 * Patrimônio líquido ao longo dos anos, contra os mesmos aportes na renda fixa — duas linhas, um eixo só,
 * legenda sempre presente e traço diferente (cheio × tracejado), nunca só cor. Cristal de foco ao passar o mouse.
 */
export function PlannerChart({ points, benchmark, nomeBenchmark = 'Mesmos aportes na renda fixa', moeda = 'hoje' }: {
  points: YearPoint[]
  benchmark: number[]
  nomeBenchmark?: string
  moeda?: 'hoje' | 'nominal'
}) {
  const [hover, setHover] = useState<number | null>(null)

  const { path, pathBench, area, ticksY, xOf, yOf } = useMemo(() => {
    const maxY = Math.max(1, ...points.map((p) => p.patrimonioLiquido), ...benchmark)
    const maxX = Math.max(1, points.at(-1)?.ano ?? 1)
    const xOf = (ano: number) => PAD.left + (ano / maxX) * (W - PAD.left - PAD.right)
    const yOf = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom)
    const linha = (valores: number[]) => valores.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(points[i].ano).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
    const path = linha(points.map((p) => p.patrimonioLiquido))
    const pathBench = linha(points.map((_, i) => benchmark[i] ?? 0))
    const area = `${path} L${xOf(points.at(-1)!.ano).toFixed(1)},${H - PAD.bottom} L${xOf(points[0].ano).toFixed(1)},${H - PAD.bottom} Z`
    const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
    return { path, pathBench, area, ticksY, xOf, yOf }
  }, [points, benchmark])

  const ultimo = points.length - 1
  const passo = points.length > 13 ? 2 : 1
  const ativo = hover ?? ultimo
  const p = points[ativo]
  const moedaTxt = moeda === 'hoje' ? 'em reais de hoje' : 'em valores nominais'

  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted mb-2">
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--red)" strokeWidth="2" /></svg>
          Seu plano em imóveis
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--heading)" strokeWidth="2" strokeDasharray="5 4" opacity="0.55" /></svg>
          {nomeBenchmark}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Patrimônio em imóveis comparado aos mesmos aportes na renda fixa, ao longo de ${points.at(-1)?.ano ?? 0} anos, ${moedaTxt}`}
        className="w-full h-auto select-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          let nearest = 0
          let best = Infinity
          points.forEach((pt, i) => {
            const d = Math.abs(xOf(pt.ano) - x)
            if (d < best) { best = d; nearest = i }
          })
          setHover(nearest)
        }}
      >
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={yOf(v)} dy="0.32em" textAnchor="end" className="fill-muted" fontSize="10">
              {formatBRLCompact(v)}
            </text>
          </g>
        ))}
        {points.filter((_, i) => i % passo === 0 || i === ultimo).map((pt) => (
          <text key={pt.ano} x={xOf(pt.ano)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-muted" fontSize="10">
            {pt.ano}
          </text>
        ))}
        <path d={area} fill="var(--red)" opacity="0.08" />
        <path d={pathBench} fill="none" stroke="var(--heading)" strokeWidth="2" strokeDasharray="5 4" opacity="0.55" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={xOf(p.ano)} x2={xOf(p.ano)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--heading)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        )}
        <circle cx={xOf(p.ano)} cy={yOf(benchmark[ativo] ?? 0)} r="3.5" fill="var(--heading)" opacity="0.55" stroke="var(--surface)" strokeWidth="2" />
        <circle cx={xOf(p.ano)} cy={yOf(p.patrimonioLiquido)} r="4" fill="var(--red)" stroke="var(--surface)" strokeWidth="2" />
      </svg>

      <div className="mt-3 grid gap-1 text-[12px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Ano {p.ano} · {p.anoCalendario}</span>
          <span className="text-muted">{moedaTxt}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Imóveis</span>
          <span className="font-display font-semibold text-heading">{formatBRL(p.patrimonioLiquido)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">{nomeBenchmark}</span>
          <span className="font-display font-semibold text-heading">{formatBRL(benchmark[ativo] ?? 0)}</span>
        </div>
      </div>

      <details className="mt-4 text-[12px]">
        <summary className="cursor-pointer text-muted hover:text-heading">Ver tabela ano a ano</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-3">Ano</th>
                <th className="py-1 pr-3">Patrimônio</th>
                <th className="py-1 pr-3">Renda fixa</th>
                <th className="py-1 pr-3">Studios c/ chaves</th>
                <th className="py-1 pr-3">Studios quitados</th>
                <th className="py-1 pr-3">Dívida</th>
                <th className="py-1">Renda/mês</th>
              </tr>
            </thead>
            <tbody>
              {points.map((pt, i) => (
                <tr key={pt.ano} className="border-t border-line">
                  <td className="py-1 pr-3">{pt.ano} · {pt.anoCalendario}</td>
                  <td className="py-1 pr-3">{formatBRL(pt.patrimonioLiquido)}</td>
                  <td className="py-1 pr-3">{formatBRL(benchmark[i] ?? 0)}</td>
                  <td className="py-1 pr-3">{pt.studiosComChaves}</td>
                  <td className="py-1 pr-3">{pt.studiosQuitadosEquiv}</td>
                  <td className="py-1 pr-3">{formatBRL(pt.divida)}</td>
                  <td className="py-1">{formatBRL(pt.rendaMensalLiquida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
