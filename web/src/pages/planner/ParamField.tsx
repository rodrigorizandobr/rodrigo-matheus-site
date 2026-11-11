import { useId } from 'react'
import { formatBRL, formatPct } from '../../planner/format'

type Kind = 'brl' | 'pct' | 'anos'

const format = (kind: Kind, value: number): string => {
  if (kind === 'brl') return formatBRL(value)
  if (kind === 'pct') return formatPct(value)
  return `${value} ${value === 1 ? 'ano' : 'anos'}`
}

/** Um slider do formulário: rótulo, valor formatado e uma dica opcional abaixo. */
export function ParamField({ label, value, onChange, min, max, step, kind, hint }: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  kind: Kind
  hint?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12px] text-muted">{label}</label>
        <span className="font-display font-semibold text-[13px] text-heading tabular-nums">{format(kind, value)}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  )
}
