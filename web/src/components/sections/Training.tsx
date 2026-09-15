import { useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'

export function Training() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'education')
  return (
    <div ref={ref}>
    <Section id="education">
      <SectionHead title={t.education.heading} />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {t.education.items.map((e, i) => (
          <Reveal as="li" key={`${e.institution}-${e.period}`} delay={i * 0.05} className="list-none">
            <article className={`panel h-full p-5 flex flex-col gap-3 ${i === 0 ? 'glow-red' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="hud-num text-2xl text-heading">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-mono text-[10.5px] text-muted">{e.period}</span>
              </div>
              <h3 className="font-display font-semibold uppercase tracking-wide text-heading text-[14px] leading-tight">{e.institution}</h3>
              <p className="text-[12.5px] leading-relaxed text-text">{e.degree}</p>
            </article>
          </Reveal>
        ))}
      </ul>
    </Section>
    </div>
  )
}
