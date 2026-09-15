import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { gaEvt } from '../../analytics/ga'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { IconArrowUpRight, IconLinkedIn } from '../ui/Icons'
import { mailtoHref } from '../ui/email'

export function Contact() {
  const { t } = useI18n()
  // O href só existe depois que o React monta: o endereço não vai no HTML servido,
  // que é onde o coletor de spam procura. Ver ui/email.ts.
  const [mailto, setMailto] = useState<string | undefined>(undefined)
  useEffect(() => setMailto(mailtoHref(t.contact.card_title)), [t.contact.card_title])
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'contact')
  const s = t.sections.contact
  return (
    <div ref={ref}>
    <Section id="contact">
      <SectionHead title={t.contact.heading} />
      <Reveal className="panel hud-frame glass-strong p-8 md:p-12 text-center max-w-3xl mx-auto">
        <h3 className="font-display font-semibold text-heading text-2xl md:text-[32px] leading-tight text-balance">{t.contact.card_title}</h3>
        <p className="text-[14px] leading-relaxed text-text mt-4 max-w-xl mx-auto">{t.contact.card_text}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a href={mailto} onClick={() => gaEvt('contact_click', { channel: 'email' })} className="btn-start !w-auto !px-10">
            <span className="tracking-[.28em]">{t.contact.btn_email}</span><span aria-hidden="true">▶</span>
          </a>
          <a href="https://www.linkedin.com/in/rodrigorizando/" target="_blank" rel="noopener noreferrer" onClick={() => gaEvt('contact_click', { channel: 'linkedin' })}
             className="cta inline-flex items-center justify-center gap-2 font-display font-semibold text-[12px] uppercase tracking-wider !py-3.5">
            <IconLinkedIn width={15} height={15} />{s.linkedin}<IconArrowUpRight width={12} height={12} />
          </a>
        </div>
      </Reveal>
    </Section>
    </div>
  )
}
