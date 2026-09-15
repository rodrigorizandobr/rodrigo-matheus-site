import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import { gaEvt } from '../../analytics/ga'
import { scrollToId } from '../../motion/lenis'
import { isSoundOn, playConfirm, playTick, setSoundOn } from '../../motion/sound'

const SECTIONS = ['about', 'experience', 'projects', 'education', 'contact'] as const

export function Header() {
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(false)
  useEffect(() => setSound(isSoundOn()), [])
  const next = lang === 'en' ? 'pt' : 'en'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Fechar a folha ao trocar de página (o link do blog navega de verdade).
  useEffect(() => {
    const onNav = () => setOpen(false)
    window.addEventListener('popstate', onNav)
    return () => window.removeEventListener('popstate', onNav)
  }, [])

  /**
   * Âncora de seção só existe na home. No blog e no painel o `#about` não casa com
   * nada, e o clique morria em silêncio — o menu fechava e a página ficava parada.
   * Fora da home o link vira `/#about` e a navegação é do NAVEGADOR, não nossa.
   */
  const onHome = typeof window === 'undefined' || window.location.pathname.replace(/\/+$/, '') === ''
  const hrefFor = (id: string) => (onHome ? `#${id}` : `/#${id}`)

  const go = (id: string) => { gaEvt('nav_click', { target: `#${id}` }); playConfirm(); setOpen(false); scrollToId(id) }
  const toggleLang = () => { gaEvt('language_switch', { to_language: next }); setLang(next) }

  const links = (cls: string) => (
    <>
      {SECTIONS.map((id) => (
        <a key={id} href={hrefFor(id)} className={cls}
           onPointerEnter={playTick}
           onClick={onHome ? (e) => { e.preventDefault(); go(id) } : () => setOpen(false)}>{t.nav[id]}</a>
      ))}
      <a href="/blog/" onClick={() => { gaEvt('nav_click', { target: '/blog' }); setOpen(false) }} className={cls}>Blog</a>
    </>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-surface/90">
      <div className="w-[min(var(--max),96vw)] mx-auto h-14 flex items-center justify-between gap-3">
        <a href="/" className="font-mono text-sm text-heading">rodrigo<span className="text-red">_</span>matheus</a>
        <nav className="hidden md:flex gap-1" aria-label="Sections">{links('hud-label px-3 py-2 hover:text-red transition-colors')}</nav>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t.nav_menu.sound} aria-pressed={sound}
            onClick={() => { const on = !sound; setSoundOn(on); setSound(on); if (on) playConfirm() }}
            className="chip !h-8 !px-2.5 text-muted hover:text-red hover:border-red transition-colors cursor-pointer">
            <span aria-hidden="true" className="font-mono text-[11px] leading-none">{sound ? '◉' : '◌'}</span>
          </button>
          <button type="button" onClick={toggleLang} onPointerEnter={playTick} aria-label={`Switch language to ${next.toUpperCase()}`}
            className="chip !h-8 font-mono text-[11px] font-bold text-muted hover:text-red hover:border-red transition-colors cursor-pointer">{next.toUpperCase()}</button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu"
            aria-label={open ? t.nav_menu.close : t.nav_menu.open}
            className="md:hidden chip !h-8 !px-2.5 cursor-pointer">
            <span aria-hidden="true" className="grid gap-[3px]"><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? 'translate-y-[4.5px] rotate-45' : ''}`} /><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? 'opacity-0' : ''}`} /><i className={`block h-[1.5px] w-4 bg-heading transition ${open ? '-translate-y-[4.5px] -rotate-45' : ''}`} /></span>
          </button>
        </div>
      </div>
      {/* Portalled: the header's backdrop-filter would otherwise become the containing block of this
          fixed sheet and clip it to the header's height.

          NÃO travamos a rolagem do documento aqui. `overflow: hidden` no <html> DESGRUDA este header
          `sticky`: com a página rolada ele saltava para a sua posição estática, fora da tela, levando
          junto o X de fechar — e o menu ficava sem saída. A folha é fixa e cobre a tela, e
          `overscroll-contain` impede o encadeamento da rolagem, que era o motivo da trava. */}
      {open && createPortal(
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
             className="md:hidden fixed inset-x-0 bottom-0 z-[60] bg-bg/85 backdrop-blur-2xl overscroll-contain overflow-y-auto"
             style={{ top: 'var(--header-h)' }}>
          <nav aria-label="Sections" className="w-[min(var(--max),94vw)] mx-auto pt-4 pb-10 flex flex-col gap-2">
            {links('panel px-4 py-4 font-display font-semibold uppercase tracking-wider text-heading text-[14px] flex items-center justify-between after:content-["▶"] after:text-red after:text-[10px]')}
            {/* Saída própria da folha: o X do cabeçalho pode sair de vista em telas curtas. */}
            <button type="button" onClick={() => setOpen(false)}
                    className="chip !h-11 mt-2 justify-center font-display font-semibold text-[11px] uppercase tracking-wider">
              {t.nav_menu.close}
            </button>
          </nav>
        </div>,
        document.body,
      )}
    </header>
  )
}
