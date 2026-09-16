import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { pinDistance, shouldPin } from '../../motion/horizontalPin'

/**
 * CAMPANHAS: todos os cargos do currículo como linha do tempo.
 *
 * No desktop a seção PRENDE e a linha corre para o lado enquanto a pessoa rola:
 * chegando ao fim da trilha, a página volta a descer normalmente; subindo, a trilha
 * desfaz o caminho sozinha, porque o avanço é amarrado à posição da rolagem
 * (`scrub`), e não a uma animação com vida própria.
 *
 * No celular e sob `prefers-reduced-motion` nada disso acontece: a mesma marcação
 * vira uma lista vertical. Sequestrar a rolagem em tela estreita é hostil.
 */
export function Campaigns() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLOListElement>(null)
  useSectionView(ref, 'experience')
  const s = t.sections.experience
  const items = t.experience.items
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const section = ref.current
    const track = trackRef.current
    if (!section || !track) return

    const ctx = gsap.context(() => {
      const build = () => {
        const distance = pinDistance(track.scrollWidth, window.innerWidth)
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (!shouldPin({ width: window.innerWidth, reduceMotion, distance })) return

        gsap.to(track, {
          x: -distance,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${distance}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            onUpdate: (self) => setProgress(self.progress),
          },
        })
      }
      build()
    }, section)

    return () => ctx.revert()
  }, [items.length])

  return (
    <div ref={ref}>
      <Section id="experience" className="lg:overflow-hidden">
        <SectionHead title={t.experience.heading} />

        {/* Barra de avanço: sem ela, a página presa parece travada. */}
        <div className="hidden lg:block h-[3px] bg-line/70 mb-8" aria-hidden="true">
          <div className="h-full bg-red origin-left transition-[width] duration-75"
               style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>

        <ol ref={trackRef} className="timeline-track flex flex-col gap-5 lg:flex-row lg:gap-6 lg:items-start lg:w-max lg:will-change-transform">
          {items.map((it, i) => {
            const active = i === 0
            return (
              <li key={`${it.company}-${it.period}`} className="relative pl-9 lg:pl-0 lg:w-[22rem] lg:shrink-0 flex lg:h-[26rem]">
                <span className="timeline-dot absolute left-[6px] top-6 lg:hidden" data-on={active} aria-hidden="true" />
                <Reveal as="article" delay={Math.min(i, 6) * 0.04}
                  className={`panel p-5 md:p-6 flex flex-col w-full ${active ? 'glow-red' : ''}`}>
                  <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
                    <span className="text-heading">{String(items.length - i).padStart(2, '0')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{it.period}</span>
                    {active && <span className="ml-1 hud-label text-red !text-[9px]">{s.current}</span>}
                  </div>
                  <h3 className="font-display font-semibold uppercase tracking-wide text-heading text-[15px] mt-2 leading-tight">{it.company}</h3>
                  <div className="text-[12.5px] text-red font-medium mt-0.5">{it.role}</div>
                  {it.location && <div className="font-mono text-[10.5px] text-muted mt-1">{it.location}</div>}
                  {/* No horizontal, o texto é aparado: cartão que cresce sozinho obriga
                      toda a trilha à altura do mais longo e enche a tela de vazio. */}
                  <p className="text-[13px] leading-relaxed text-text mt-3 lg:line-clamp-[12]">{it.description}</p>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </Section>
    </div>
  )
}
