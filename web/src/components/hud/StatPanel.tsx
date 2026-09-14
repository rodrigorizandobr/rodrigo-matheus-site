import type { CSSProperties } from 'react'
import type { Character, CharacterClass } from '../../data/character'
import type { Dictionary } from '../../i18n/types'
import { useCountUp } from '../../hooks/useCountUp'
import { CLASS_ICON } from '../ui/Icons'

type Props = { character: Character; activeClass: CharacterClass; hud: Dictionary['hud'] }

/** Right-hand HUD: identity, LEVEL block, four stat bars with a ruler, core modules. Announces class changes. */
export function StatPanel({ character, activeClass, hud }: Props) {
  const level = useCountUp(character.level)
  return (
    <section aria-label={activeClass.label} aria-live="polite" className="panel hud-frame p-5 md:p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-muted flex items-center gap-2 mb-1.5">
            <span>{hud.id_label} {character.callsign}</span>
            <span aria-hidden="true">·</span>
            <span>{hud.location}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-heading"><span className="chip-dot" data-on="true" aria-hidden="true" />{hud.status_online}</span>
          </div>
          <h1 className="font-display text-heading text-xl md:text-[22px] font-semibold tracking-wide uppercase leading-tight">
            {character.name}
          </h1>
          <p className="mt-1 text-[12px] text-muted font-mono">
            <span className="text-heading font-medium">{activeClass.label}</span>
            <span aria-hidden="true"> · </span>
            <span>{hud.class_rank}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="hud-num glow text-[46px] md:text-[52px] text-heading">{level}</div>
          <div className="inline-block bg-heading text-surface font-display font-bold text-[11px] tracking-[.22em] px-2 py-0.5 -mt-1">{hud.level}</div>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-text min-h-[3.9em]">{activeClass.blurb}</p>

      <ul className="flex flex-col gap-2.5">
        {character.stats.map((s) => {
          const labelId = `stat-${s.key}`
          return (
            <li key={s.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
              <span id={labelId} className="hud-label">{s.label}</span>
              <span className="hud-num text-sm text-heading">{s.value}</span>
              <div
                role="progressbar"
                aria-labelledby={labelId}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={s.pct}
                className="stat-track col-span-2"
                style={{ '--pct': s.pct } as CSSProperties}
              >
                <div className="stat-fill" />
              </div>
              <div className="ruler col-span-2" aria-hidden="true" />
            </li>
          )
        })}
      </ul>

      <div>
        <div className="hud-label mb-2">{hud.top_skills}</div>
        <ul className="grid grid-cols-4 gap-2">
          {character.classes.map((c) => {
            const Glyph = CLASS_ICON[c.id]
            const on = c.id === activeClass.id
            return (
              <li key={c.id} className="module-tile" data-on={on} title={c.label}>
                {Glyph && <Glyph width={18} height={18} />}
                <span className="font-mono text-[8.5px] uppercase tracking-wider leading-none mt-1.5 text-center">{c.label.split(' ')[0]}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
