import { useMemo, useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { buildCharacter } from '../../data/character'
import { useSectionView } from '../../hooks/useSectionView'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { CLASS_ICON } from '../ui/Icons'

/** BIO: the human behind the unit — real photo, lead, the ten skills, and the same three numbers as the hero. */
export function About() {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useSectionView(ref, 'about')
  const character = useMemo(() => buildCharacter(t), [t])
  const s = t.sections.about

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
    <Section id="about">
      <SectionHead tag={s.tag} title={t.about.heading} sub={s.sub} />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
        <Reveal className="panel hud-frame photo-frame p-4">
          <img
            src="/rodrigo-800.webp"
            srcSet="/rodrigo-480.webp 480w, /rodrigo-800.webp 800w"
            sizes="(min-width:1024px) 360px, 90vw"
            width={800} height={1200}
            alt={`${character.name} — ${t.hero.tag}`}
            loading="eager" decoding="async"
            className="w-full h-auto object-contain drop-shadow-[0_24px_40px_rgba(20,20,26,.25)]"
          />
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted">
            <span>{t.hud.id_label} {character.callsign}</span>
            <span className="inline-flex items-center gap-1"><span className="chip-dot" data-on="true" aria-hidden="true" />{t.hud.status_online}</span>
          </div>
        </Reveal>

        <div className="flex flex-col gap-5">
          <Reveal className="panel p-6 md:p-7" delay={0.05}>
            <p className="text-[15px] md:text-[16px] leading-relaxed text-text max-w-3xl">{t.about.lead}</p>
          </Reveal>

          <Reveal className="panel p-6" delay={0.1}>
            <div className="hud-label mb-3">{s.facts}</div>
            <dl className="grid grid-cols-3 gap-3">
              {character.stats.slice(0, 3).map((st) => (
                <div key={st.key} className="panel-solid border border-line p-3">
                  <dt className="hud-label !text-[9.5px]">{st.label}</dt>
                  <dd className="hud-num text-2xl md:text-3xl text-heading mt-1">{st.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal className="panel p-6" delay={0.15}>
            <div className="flex items-center justify-between mb-3">
              <span className="hud-label">{s.skills}</span>
              <span className="flex gap-1.5">
                {character.classes.map((c) => { const G = CLASS_ICON[c.id]; return G ? <G key={c.id} width={14} height={14} className="text-muted" /> : null })}
              </span>
            </div>
            <ul aria-label={s.skills} className="flex flex-wrap gap-2">
              {character.skills.map((sk, i) => (
                <li key={sk} className="font-mono text-[11.5px] px-2.5 py-1.5 border border-line bg-surface/70 text-heading hover:border-red hover:text-red transition-colors">
                  <span className="text-muted mr-1.5">{String(i + 1).padStart(2, '0')}</span>{sk}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </Section>
    </div>
  )
}
