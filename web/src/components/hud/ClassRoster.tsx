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

/**
 * Lista de classes da esquerda.
 *
 * Sem retrato: as quatro miniaturas eram o MESMO rosto do androide, então os cartões
 * ficavam indistinguíveis e pesados. Quem diferencia é o ícone da classe, agora grande
 * e em primeiro plano. O cartão ativo usa o néon vermelho padrão do site (`neon-red`),
 * o mesmo do START — em vez de cada componente inventar o seu "ligado".
 */
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
            className={`panel roster-card neon-red-hover group text-left p-3 flex items-center gap-3 cursor-pointer transition-transform hover:-translate-y-0.5 shrink-0 snap-start w-[64vw] sm:w-[40vw] lg:w-auto lg:shrink ${active ? 'neon-red' : ''}`}
          >
            <span aria-hidden="true"
                  className={`grid place-items-center w-11 h-11 shrink-0 border transition-colors ${active ? 'border-red text-red bg-red/5' : 'border-line text-muted group-hover:text-heading'}`}>
              {Glyph && <Glyph width={20} height={20} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-semibold uppercase tracking-wide text-[12px] leading-tight text-heading">{c.label}</span>
              <span className="block font-mono text-[10px] text-muted mt-0.5 truncate">{c.unit ?? c.id}</span>
            </span>
            {active && <span className="hud-label text-red !text-[9px] shrink-0">{hud.active}</span>}
          </button>
        )
      })}
    </nav>
  )
}
