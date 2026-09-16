import { useMemo, useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { buildCharacter } from '../../data/character'
import { useSectionView } from '../../hooks/useSectionView'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { CLASS_ICON } from '../ui/Icons'

/** BIO: lead, the ten skills, and the same three numbers as the hero. Only the android appears on the site (PO decision). */
export function About() {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useSectionView(ref, 'about')
  const character = useMemo(() => buildCharacter(t), [t])
  const s = t.sections.about

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
    <Section id="about">
      <SectionHead title={t.about.heading} />
      <div className="grid gap-6 items-start">
        <div className="flex flex-col gap-5">
          <Reveal className="panel hud-frame p-6 md:p-7">
            <div className="flex items-center justify-between font-mono text-[10px] text-muted mb-4">
              <span>{character.name}</span>
              <span className="inline-flex items-center gap-1"><span className="chip-dot" data-on="true" aria-hidden="true" />{t.hud.status_online}</span>
            </div>
            {/* sem limite de largura: dentro de um cartão largo, o texto parando antes
                da borda deixava uma faixa vazia à direita e parecia erro de layout */}
            <p className="text-[15px] md:text-[17px] leading-relaxed text-text">{t.about.lead}</p>
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

          <Reveal className="panel p-6" delay={0.1}>
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <div className="hud-label mb-3">{s.stack}</div>
                <ul aria-label={s.stack} className="flex flex-wrap gap-2">
                  {t.about.stack.map((tech) => (
                    <li key={tech} className="font-mono text-[11.5px] px-2.5 py-1.5 border border-line bg-surface/70 text-heading">{tech}</li>
                  ))}
                </ul>
              </div>
              <div className="md:border-l md:border-line md:pl-5">
                <div className="hud-label mb-3">{s.languages}</div>
                <ul className="grid gap-1.5">
                  {t.about.languages.map((idioma) => (
                    <li key={idioma} className="font-mono text-[11.5px] text-text whitespace-nowrap">{idioma}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal className="panel p-6" delay={0.1}>
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
