import { useCallback, useEffect, useMemo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { buildCharacter } from '../../data/character'
import { StatPanel } from '../hud/StatPanel'
import { ActionBar, StartButton } from '../hud/ActionBar'
import { TopStrip } from '../hud/TopStrip'
import { HintsBar } from '../hud/HintsBar'
import { SyncStamp } from '../hud/SyncStamp'
import { gaEvt } from '../../analytics/ga'
import { scrollToId } from '../../motion/lenis'

/**
 * Tela de abertura. O androide é o fundo inteiro; o HUD flutua sobre ele em duas colunas,
 * deixando o centro livre para o rosto. HUD é DOM, nunca canvas.
 *
 * A lista de classes saiu (decisão do PO): ela repetia o que o painel da direita já diz
 * — cargo, classe e os quatro domínios — e a interação não acrescentava nada. No lugar,
 * a coluna da esquerda recebeu a PROPOSTA DE VALOR, que antes flutuava sobre o peito do
 * robô atrás de um degradê. O centro ficou só do personagem.
 */
export function Hero() {
  const { t, lang, setLang } = useI18n()
  const character = useMemo(() => buildCharacter(t), [t])
  const active = character.classes[0]
  const start = useCallback(() => scrollToId('about'), [])

  // A HintsBar promete estas teclas, então elas valem na página inteira.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Enter' && !tgt?.closest('button, a')) {
        gaEvt('cta_start', { via: 'key' }); start()
      } else if (e.key === 'l' || e.key === 'L') {
        const next = lang === 'en' ? 'pt' : 'en'
        gaEvt('language_switch', { to_language: next, via: 'key' }); setLang(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lang, setLang, start])

  return (
    <section id="hero" data-scene="hero" className="relative z-10 flex flex-col lg:block lg:h-[calc(100svh-var(--header-h))] lg:min-h-[600px] overflow-hidden">

      {/* below lg the columns stack: headline sits right under the fixed stage band */}
      <div className="lg:hidden relative z-10 px-5 pb-2 pt-6 text-center">
        <h1 className="font-display text-heading text-[21px] leading-[1.14] font-semibold text-balance">{t.hero.title}</h1>
        <p className="text-muted text-[12px] leading-snug mt-2">{t.hero.subtitle}</p>
      </div>

      <div className="relative z-10 lg:h-full w-[min(var(--max),94vw)] mx-auto grid items-start gap-3 lg:gap-4 pt-4 lg:pt-4 pb-8 lg:pb-5 lg:grid-cols-[290px_minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr_auto]">
        <div className="hidden lg:block lg:col-span-3"><TopStrip hud={t.hud} /></div>
        {/* coluna da esquerda: a proposta de valor, agora com lugar próprio */}
        <div className="hidden lg:flex flex-col justify-center min-h-0 self-stretch">
          <div className="panel glass-strong p-6 xl:p-7">
            <span className="hud-label block text-red">{character.callsign}</span>
            <h1 className="font-display text-heading text-[26px] xl:text-[30px] leading-[1.12] font-semibold text-balance mt-3">
              {t.hero.title}
            </h1>
            <p className="text-muted text-[12.5px] leading-relaxed mt-3">{t.hero.subtitle}</p>
            <ul className="flex flex-wrap gap-1.5 mt-5">
              {character.classes.map((c) => (
                <li key={c.id} className="chip !h-7 !px-2.5 font-mono !text-[10px] text-muted">{c.label}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* centro: só o personagem */}
        <div className="hidden lg:block min-w-0" aria-hidden="true" />

        {/* Deliberately sparse, like the reference: identity, stats, actions. The ten skill
            pills live in the About section, where there is room for them. */}
        <div className="flex flex-col gap-2.5 min-h-0">
          {active && <StatPanel character={character} activeClass={active} hud={t.hud} />}
          <ActionBar hero={t.hero} hud={t.hud} />
          <StartButton label={t.hud.start} onStart={start} />
        </div>

        <div className="hidden lg:flex lg:col-span-3 items-end justify-between pt-2">
          <HintsBar hud={t.hud} />
          <SyncStamp t={t} />
        </div>
      </div>

    </section>
  )
}
