import { useMemo, useState } from 'react'
import type { PensionYearPoint } from '../../pension/types'
import { formatBRL, formatBRLCompact, formatPct } from '../../planner/format'

const W = 640
const H = 280
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

/** Saldo bruto x líquido estimado ao longo dos anos — duas linhas, mesma escala:
 * a distância entre elas É o imposto que o regime escolhido cobraria hoje. */
export function PensionChart({ points }: { points: PensionYearPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const { pathBruto, pathLiquido, area, ticksY, xOf, yOf } = useMemo(() => {
    const maxY = Math.max(1, ...points.map((p) => p.saldoBruto))
    const maxX = Math.max(1, points.at(-1)?.ano ?? 1)
    const xOf = (ano: number) => PAD.left + (ano / maxX) * (W - PAD.left - PAD.right)
    const yOf = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom)
    const linha = (campo: 'saldoBruto' | 'saldoLiquidoEstimado') => {
      const coords = points.map((p) => [xOf(p.ano), yOf(p[campo])] as const)
      return coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    }
    const pathBruto = linha('saldoBruto')
    const pathLiquido = linha('saldoLiquidoEstimado')
    const coordsLiquido = points.map((p) => [xOf(p.ano), yOf(p.saldoLiquidoEstimado)] as const)
    const area = `${pathLiquido} L${coordsLiquido.at(-1)![0].toFixed(1)},${H - PAD.bottom} L${coordsLiquido[0][0].toFixed(1)},${H - PAD.bottom} Z`
    const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
    return { pathBruto, pathLiquido, area, ticksY, xOf, yOf, maxY }
  }, [points])

  const ultimo = points.length - 1
  const passo = points.length > 13 ? 2 : 1
  const ativo = hover ?? ultimo
  const p = points[ativo]

  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="flex items-center gap-4 mb-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted"><i className="inline-block w-3 h-[2px] bg-heading" aria-hidden="true" /> saldo bruto</span>
        <span className="flex items-center gap-1.5 text-muted"><i className="inline-block w-3 h-[2px] bg-red" aria-hidden="true" /> saldo líquido estimado</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Saldo bruto e líquido estimado da previdência ao longo de ${points.at(-1)?.ano ?? 0} anos`}
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
        <path d={pathBruto} fill="none" stroke="var(--heading)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.5" />
        <path d={pathLiquido} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={xOf(p.ano)} x2={xOf(p.ano)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--heading)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        )}
        <circle cx={xOf(p.ano)} cy={yOf(p.saldoLiquidoEstimado)} r="4" fill="var(--red)" stroke="var(--surface)" strokeWidth="2" />
      </svg>

      <div className="mt-3 flex items-baseline justify-between text-[12px]">
        <span className="text-muted">Ano {p.ano} · alíquota estimada {formatPct(p.aliquotaMedia)}</span>
        <span className="font-display font-semibold text-heading">{formatBRL(p.saldoLiquidoEstimado)}</span>
      </div>

      <details className="mt-4 text-[12px]">
        <summary className="cursor-pointer text-muted hover:text-heading">Ver tabela ano a ano</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-3">Ano</th>
                <th className="py-1 pr-3">Saldo bruto</th>
                <th className="py-1 pr-3">Saldo líquido</th>
                <th className="py-1 pr-3">Alíquota estimada</th>
                <th className="py-1">Renda/mês estimada</th>
              </tr>
            </thead>
            <tbody>
              {points.map((pt) => (
                <tr key={pt.ano} className="border-t border-line">
                  <td className="py-1 pr-3">{pt.ano}</td>
                  <td className="py-1 pr-3">{formatBRL(pt.saldoBruto)}</td>
                  <td className="py-1 pr-3">{formatBRL(pt.saldoLiquidoEstimado)}</td>
                  <td className="py-1 pr-3">{formatPct(pt.aliquotaMedia)}</td>
                  <td className="py-1">{formatBRL(pt.rendaMensalEstimada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
