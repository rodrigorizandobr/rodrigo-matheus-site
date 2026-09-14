import { useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'

/** CAMPAIGNS: the 16 roles as a timeline. First one is the active mission. */
export function Campaigns() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'experience')
  const s = t.sections.experience
  const items = t.experience.items

  return (
    <div ref={ref}>
    <Section id="experience">
      <SectionHead tag={s.tag} title={t.experience.heading} sub={s.sub}
        aside={<span className="chip"><b className="hud-num text-[13px]">{items.length}</b><span className="hud-label !text-[9.5px]">{s.count}</span></span>} />
      <ol className="timeline flex flex-col gap-5 lg:gap-6">
        {items.map((it, i) => {
          const active = i === 0
          const left = i % 2 === 0
          return (
            <li key={`${it.company}-${it.period}`} className={`relative pl-9 lg:pl-0 lg:grid lg:grid-cols-2 lg:gap-12 ${left ? '' : ''}`}>
              <span className="timeline-dot absolute left-[6px] top-6 lg:left-1/2 lg:-ml-[6px]" data-on={active} aria-hidden="true" />
              <Reveal as="article" delay={Math.min(i, 6) * 0.04}
                className={`panel p-5 md:p-6 ${left ? 'lg:col-start-1 lg:text-right' : 'lg:col-start-2'} ${active ? 'glow-red' : ''}`}>
                <div className={`flex items-center gap-2 font-mono text-[10.5px] text-muted ${left ? 'lg:justify-end' : ''}`}>
                  <span className="text-heading">{String(items.length - i).padStart(2, '0')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{it.period}</span>
                  {active && <span className="ml-1 hud-label text-red !text-[9px]">{s.current}</span>}
                </div>
                <h3 className="font-display font-semibold uppercase tracking-wide text-heading text-[15px] mt-2 leading-tight">{it.company}</h3>
                <div className="text-[12.5px] text-red font-medium mt-0.5">{it.role}</div>
                <p className="text-[13px] leading-relaxed text-text mt-3">{it.description}</p>
              </Reveal>
            </li>
          )
        })}
      </ol>
    </Section>
    </div>
  )
}
