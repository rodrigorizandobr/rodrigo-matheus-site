import { useRef, type KeyboardEvent } from 'react'
import type { CharacterClass } from '../../data/character'
import type { Dictionary } from '../../i18n/types'
import { gaEvt } from '../../analytics/ga'
import { CLASS_ICON } from '../ui/Icons'

type Props = {
  classes: CharacterClass[]
  activeId: string
  hud: Dictionary['hud']
  onSelect: (c: CharacterClass) => void
}

/** Left-hand roster: portrait, class, real "unit" (where that role was played), rank. Arrow keys cycle. */
export function ClassRoster({ classes, activeId, hud, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (c: CharacterClass) => {
    onSelect(c)
    gaEvt('class_select', { class: c.id })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + classes.length) % classes.length
    refs.current[next]?.focus()
    select(classes[next])
  }

  return (
    <nav aria-label={hud.classes} className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-[3vw] px-[3vw] lg:mx-0 lg:px-0 lg:overflow-visible lg:flex-col">
      <div className="hidden lg:flex items-center justify-between px-1 pb-1">
        <span className="hud-label">{hud.classes}</span>
        <span className="hud-label !text-[9.5px] text-red">{classes.length} {hud.unit}S</span>
      </div>
      {classes.map((c, i) => {
        const active = c.id === activeId
        const Glyph = CLASS_ICON[c.id]
        return (
          <button
            key={c.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            aria-pressed={active}
            data-active={active}
            onClick={() => select(c)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="panel roster-card group text-left p-2 pr-3 flex items-center gap-3 cursor-pointer transition-transform hover:-translate-y-0.5 data-[active=true]:border-red shrink-0 snap-start w-[64vw] sm:w-[40vw] lg:w-auto lg:shrink"
          >
            <span className="relative shrink-0">
              <img
                src={`/hero/class-${c.id}.webp`}
                alt=""
                aria-hidden="true"
                width={52}
                height={52}
                loading="lazy"
                decoding="async"
                className="w-[52px] h-[52px] object-cover border border-line bg-surface-2 opacity-80 transition group-hover:opacity-100 data-[on=true]:opacity-100 data-[on=true]:border-red"
                data-on={active}
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 grid place-items-center bg-heading text-surface font-display font-bold text-[9px] leading-none" aria-hidden="true">S</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-semibold uppercase tracking-wide text-[12px] leading-tight text-heading">{c.label}</span>
              <span className="block font-mono text-[10px] text-muted mt-0.5 truncate">{hud.unit} · {c.unit ?? c.id}</span>
            </span>
            <span className="flex flex-col items-end gap-1 shrink-0">
              {Glyph && <Glyph width={15} height={15} className={active ? 'text-red' : 'text-muted'} />}
              {active && <span className="hud-label text-red !text-[9px]">{hud.active}</span>}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
