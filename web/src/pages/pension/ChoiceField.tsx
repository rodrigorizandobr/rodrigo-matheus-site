/**
 * Vehicle (PGBL/VGBL) e regime (regressiva/progressiva) são ESCOLHAS, não um
 * valor numa régua — por isso não entram no `ParamField` (slider). Dois botões
 * lado a lado, o ativo com o mesmo `.neon-red` do resto do site.
 */
export function ChoiceField<T extends string>({ label, value, onChange, options, hint }: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  hint?: string
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
                  aria-pressed={value === o.value}
                  className={`chip !h-9 justify-center font-display font-semibold text-[12px] uppercase tracking-wider
                              ${value === o.value ? 'neon-red' : ''}`}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  )
}
