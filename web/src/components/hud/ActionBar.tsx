import { gaEvt } from '../../analytics/ga'
import type { Dictionary } from '../../i18n/types'
import { IconArrowUpRight, IconDoc, IconGitHub, IconLinkedIn } from '../ui/Icons'

/** Same three destinations and the same `hero_click {button}` event as v2 — now with icons and sublabels. */
const LINKS = {
  linkedin: { href: 'https://www.linkedin.com/in/rodrigorizando/', external: true, Icon: IconLinkedIn },
  cv: { href: '/cv-pt-br.pdf', external: false, Icon: IconDoc },
  github: { href: 'https://github.com/rodrigorizandobr/', external: true, Icon: IconGitHub },
} as const

export function ActionBar({ hero, hud }: { hero: Dictionary['hero']; hud: Dictionary['hud'] }) {
  const items = [
    { ...LINKS.linkedin, label: hero.btn_linkedin, sub: hud.cta.linkedin_sub, primary: true },
    { ...LINKS.cv, label: hero.btn_cv, sub: hud.cta.cv_sub, primary: false },
    { ...LINKS.github, label: hero.btn_github, sub: hud.cta.github_sub, primary: false },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ Icon, ...it }) => (
        <a
          key={it.href}
          href={it.href}
          {...(it.external ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}
          onClick={() => gaEvt('hero_click', { button: it.label })}
          className={`cta group ${it.primary ? 'cta-primary' : ''}`}
        >
          <span className="flex items-center justify-between">
            <Icon width={16} height={16} />
            <IconArrowUpRight width={13} height={13} className="opacity-0 -translate-x-1 translate-y-1 transition group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0" />
          </span>
          <span className="block font-display font-semibold uppercase tracking-wider text-[12px] mt-2 leading-none">{it.label}</span>
          <span className="block font-mono text-[9.5px] opacity-70 mt-1 leading-none" aria-hidden="true">{it.sub}</span>
        </a>
      ))}
    </div>
  )
}

export function StartButton({ label, onStart }: { label: string; onStart: () => void }) {
  return (
    <button type="button" onClick={() => { gaEvt('cta_start'); onStart() }} className="btn-start group">
      <span className="tracking-[.32em]">{label}</span>
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">▶</span>
    </button>
  )
}
