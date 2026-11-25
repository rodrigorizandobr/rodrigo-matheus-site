import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import { gaEvt } from '../../analytics/ga'
import { LINKEDIN } from '../../home/links'
import { isSoundOn, playConfirm, playTick, setSoundOn } from '../../motion/sound'

/** Formulários avulsos. Mais um entra aqui, não vira item novo no cabeçalho. */
const UTILS = [
  { label: 'Vivendo de Imóveis', href: '/vivendo-de-imoveis' },
  { label: 'Previdência Privada', href: '/previdencia-privada' },
]

/**
 * Cabeçalho do site v4: blog, utilitários, currículo. A marca `//` é o ponto de onde o fio condutor
 * sai (`data-fio="mark"`), e o fundo é OPACO de propósito — o fio passa por baixo sem aparecer.
 * Todo link navega de verdade: não há mais seção da home para rolar até ela.
 */
export function Header() {
  const { t, lang, setLang } = useI18n()
  const n = t.home.nav
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

  useEffect(() => {
    const onNav = () => setOpen(false)
    window.addEventListener('popstate', onNav)
    return () => window.removeEventListener('popstate', onNav)
  }, [])

  // Na home o cabeçalho usa a mesma coluna da página: a marca `//` tem que cair exatamente sobre o fio.
  // Nas outras páginas ele acompanha a largura do conteúdo delas.
  const onHome = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === ''
  const toggleLang = () => { gaEvt('language_switch', { to_language: next }); setLang(next) }
  const pages = [
    { label: n.blog, href: '/blog/' },
    { label: n.resume, href: '/curriculo' },
  ]
  const visit = (href: string) => () => { gaEvt('nav_click', { target: href }); setOpen(false) }
  const sheetLink = 'panel px-4 py-4 font-display font-semibold uppercase tracking-wider text-heading text-[14px] flex items-center justify-between after:content-["▶"] after:text-red after:text-[10px]'

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg">
      <div className={`${onHome ? 'fio-wrap' : 'w-[min(var(--max),96vw)] mx-auto'} h-14 flex items-center justify-between gap-3`}>
        <a href="/" className="fio-brand" aria-label="Rodrigo Matheus">
          <svg data-fio="mark" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 16 8 2M10 16 15 2" stroke="var(--red)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
          {/* Celular: sem espaço para o nome inteiro ao lado dos três botões, fica a sigla. Só visual: o nome que o leitor de tela lê é o do aria-label. */}
          <span className="max-sm:hidden">Rodrigo Matheus</span>
          <span className="sm:hidden" aria-hidden="true">RM</span>
        </a>
        <nav className="hidden md:flex items-center gap-1 ml-auto" aria-label="Sections">
          <a href={pages[0].href} onClick={visit(pages[0].href)} onPointerEnter={playTick} className="fio-nav-link">{pages[0].label}</a>
          <UtilsMenu label={n.tools} />
          <a href={pages[1].href} onClick={visit(pages[1].href)} onPointerEnter={playTick} className="fio-nav-link">{pages[1].label}</a>
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" onPointerEnter={playTick} className="fio-nav-link">LinkedIn ↗</a>
        </nav>
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
      {/* A folha sai por portal para o <body>: um ancestral com filtro viraria o bloco de contenção de
          um `fixed` e a cortaria na altura do cabeçalho.

          NÃO travamos a rolagem do documento aqui. `overflow: hidden` no <html> DESGRUDA este header
          `sticky`: com a página rolada ele saltava para a sua posição estática, fora da tela, levando
          junto o X de fechar — e o menu ficava sem saída. A folha é fixa e cobre a tela, e
          `overscroll-contain` impede o encadeamento da rolagem, que era o motivo da trava. */}
      {open && createPortal(
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
             className="md:hidden fixed inset-x-0 bottom-0 z-[60] bg-bg/85 backdrop-blur-2xl overscroll-contain overflow-y-auto"
             style={{ top: 'var(--header-h)' }}>
          <nav aria-label="Sections" className="w-[min(var(--max),94vw)] mx-auto pt-4 pb-10 flex flex-col gap-2">
            {pages.map((p) => <a key={p.href} href={p.href} onClick={visit(p.href)} className={sheetLink}>{p.label}</a>)}
            <div className="hud-label px-4 pt-3 pb-1">{n.tools}</div>
            {UTILS.map((u) => <a key={u.href} href={u.href} onClick={() => setOpen(false)} className={sheetLink}>{u.label}</a>)}
            <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={`${sheetLink} mt-3`}>LinkedIn</a>
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

/**
 * "Utilitários" é um rótulo, não um link — só abre o submenu. Abre ao mouse E ao teclado
 * (`group-focus-within`, sem JS): tabular até o primeiro item mantém o menu aberto. Só existe no nav
 * de desktop; no menu mobile os itens entram direto, sem hover para abrir.
 */
function UtilsMenu({ label }: { label: string }) {
  return (
    <div className="relative group/utils">
      <button type="button" aria-haspopup="true" className="fio-nav-link flex items-center gap-1 cursor-default">
        {label}
        <span aria-hidden="true" className="text-[9px] translate-y-px">▾</span>
      </button>
      <div className="absolute left-0 top-full pt-2 opacity-0 invisible -translate-y-1 transition-all duration-150
                      group-hover/utils:opacity-100 group-hover/utils:visible group-hover/utils:translate-y-0
                      group-focus-within/utils:opacity-100 group-focus-within/utils:visible group-focus-within/utils:translate-y-0">
        <div className="min-w-[210px] py-1.5 bg-surface border border-line shadow-[0_14px_40px_rgba(20,20,26,.12)]">
          {UTILS.map((u) => (
            <a key={u.href} href={u.href} onPointerEnter={playTick} className="fio-nav-link block !px-4 !py-2.5 whitespace-nowrap">{u.label}</a>
          ))}
        </div>
      </div>
    </div>
  )
}
