import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { buildCharacter, type CharacterClass } from '../../data/character'
import { ClassRoster } from '../hud/ClassRoster'
import { StatPanel } from '../hud/StatPanel'
import { ActionBar, StartButton } from '../hud/ActionBar'
import { TopStrip } from '../hud/TopStrip'
import { HintsBar } from '../hud/HintsBar'
import { SyncStamp } from '../hud/SyncStamp'
import { gaEvt } from '../../analytics/ga'
import { scrollToId } from '../../motion/lenis'

/**
 * "Character select" screen. The robot is the full-bleed background; the HUD floats over it in
 * two columns, leaving the centre open so the face reads. HUD is DOM, never canvas.
 */
export function Hero() {
  const { t, lang, setLang } = useI18n()
  const character = useMemo(() => buildCharacter(t), [t])
  const [activeId, setActiveId] = useState(() => character.classes[0]?.id ?? '')
  const active = character.classes.find((c) => c.id === activeId) ?? character.classes[0]
  const onSelect = useCallback((c: CharacterClass) => setActiveId(c.id), [])
  const start = useCallback(() => scrollToId('about'), [])

  // The hints bar promises these keys, so they have to work anywhere on the page —
  // not only while a roster button has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const i = character.classes.findIndex((c) => c.id === activeId)
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (tgt?.closest('nav[aria-label]')) return // roster handles its own arrows (with focus)
        e.preventDefault()
        const next = character.classes[(i + (e.key === 'ArrowRight' ? 1 : -1) + character.classes.length) % character.classes.length]
        if (next) { setActiveId(next.id); gaEvt('class_select', { class: next.id, via: 'key' }) }
      } else if (e.key === 'Enter' && !tgt?.closest('button, a')) {
        gaEvt('cta_start', { via: 'key' }); start()
      } else if (e.key === 'l' || e.key === 'L') {
        const next = lang === 'en' ? 'pt' : 'en'
        gaEvt('language_switch', { to_language: next, via: 'key' }); setLang(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [character.classes, activeId, lang, setLang, start])

  return (
    <section id="hero" data-scene="hero" className="relative z-10 flex flex-col lg:block lg:h-[calc(100svh-var(--header-h))] lg:min-h-[600px] overflow-hidden">

      {/* below lg the columns stack: headline sits right under the fixed stage band */}
      <div className="lg:hidden relative z-10 px-5 pb-2 pt-6 text-center">
        <h1 className="font-display text-heading text-[21px] leading-[1.14] font-semibold text-balance">{t.hero.title}</h1>
        <p className="text-muted text-[12px] leading-snug mt-2">{t.hero.subtitle}</p>
      </div>

      <div className="relative z-10 lg:h-full w-[min(var(--max),94vw)] mx-auto grid items-start gap-3 lg:gap-4 pt-4 lg:pt-4 pb-8 lg:pb-5 lg:grid-cols-[290px_minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr_auto]">
        <div className="hidden lg:block lg:col-span-3"><TopStrip hud={t.hud} /></div>
        <ClassRoster classes={character.classes} activeId={active.id} hud={t.hud} onSelect={onSelect} />

        {/* centre column: the character shows through, the value proposition sits over its chest */}
        <div className="hidden lg:block relative self-stretch min-w-0">
          <div className="absolute inset-x-0 bottom-0 text-center pointer-events-none px-4 pt-16 pb-1 bg-gradient-to-t from-bg via-bg/85 to-transparent rounded-t-3xl">
            <h1 className="font-display text-heading text-[30px] xl:text-[34px] leading-[1.12] font-semibold text-balance">
              {t.hero.title}
            </h1>
            <p className="text-muted text-[12.5px] leading-snug mt-2.5 max-w-lg mx-auto">{t.hero.subtitle}</p>
          </div>
        </div>

        {/* Deliberately sparse, like the reference: identity, stats, actions. The ten skill
            pills live in the About section, where there is room for them. */}
        <div className="flex flex-col gap-2.5 min-h-0">
          {active && <StatPanel character={character} activeClass={active} hud={t.hud} />}
          <ActionBar hero={t.hero} hud={t.hud} />
          <StartButton label={t.hud.start} onStart={start} />
        </div>

        <div className="hidden lg:flex lg:col-span-3 items-end justify-between pt-2">
          <HintsBar hud={t.hud} />
          <SyncStamp t={t} />
        </div>
      </div>

    </section>
  )
}
