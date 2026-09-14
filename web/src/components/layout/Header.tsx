import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import { gaEvt } from '../../analytics/ga'
import { scrollToId } from '../../motion/lenis'

const SECTIONS = ['about', 'experience', 'projects', 'education', 'contact'] as const

export function Header() {
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const next = lang === 'en' ? 'pt' : 'en'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.style.overflow = '' }
  }, [open])

  const go = (id: string) => { gaEvt('nav_click', { target: `#${id}` }); setOpen(false); scrollToId(id) }
  const toggleLang = () => { gaEvt('language_switch', { to_language: next }); setLang(next) }

  const links = (cls: string) => (
    <>
      {SECTIONS.map((id) => (
        <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id) }} className={cls}>{t.nav[id]}</a>
      ))}
      <a href="/blog/" onClick={() => { gaEvt('nav_click', { target: '/blog' }); setOpen(false) }} className={cls}>Blog</a>
    </>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/70 backdrop-blur-xl">
      <div className="w-[min(var(--max),96vw)] mx-auto h-14 flex items-center justify-between gap-3">
        <a href="/" className="font-mono text-sm text-heading">rodrigo<span className="text-red">_</span>matheus</a>
        <nav className="hidden md:flex gap-1" aria-label="Sections">{links('hud-label px-3 py-2 hover:text-red transition-colors')}</nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleLang} aria-label={`Switch language to ${next.toUpperCase()}`}
            className="chip !h-8 font-mono text-[11px] font-bold text-muted hover:text-red hover:border-red transition-colors cursor-pointer">{next.toUpperCase()}</button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu"
            aria-label={open ? t.nav_menu.close : t.nav_menu.open}
            className="md:hidden chip !h-8 !px-2.5 cursor-pointer">
            <span aria-hidden="true" className="grid gap-[3px]"><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? 'translate-y-[4.5px] rotate-45' : ''}`} /><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? 'opacity-0' : ''}`} /><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? '-translate-y-[4.5px] -rotate-45' : ''}`} /></span>
          </button>
        </div>
      </div>
      {/* Portalled: the header's backdrop-filter would otherwise become the containing block of this
          fixed sheet and clip it to the header's height. */}
      {open && createPortal(
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
             className="md:hidden fixed inset-x-0 bottom-0 z-[60] bg-bg/85 backdrop-blur-2xl overscroll-contain overflow-y-auto"
             style={{ top: 'var(--header-h)' }}>
          <nav aria-label="Sections" className="w-[min(var(--max),94vw)] mx-auto pt-4 pb-10 flex flex-col gap-2">
            {links('panel px-4 py-4 font-display font-semibold uppercase tracking-wider text-heading text-[14px] flex items-center justify-between after:content-["▶"] after:text-red after:text-[10px]')}
          </nav>
        </div>,
        document.body,
      )}
    </header>
  )
}
