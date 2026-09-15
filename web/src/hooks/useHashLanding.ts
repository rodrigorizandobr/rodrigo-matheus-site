import { useEffect } from 'react'
import { scrollToId } from '../motion/lenis'

/** Seções que o menu oferece — só elas são destino de chegada por hash. */
const SECTIONS = ['about', 'experience', 'projects', 'education', 'contact', 'blog']

export function sectionFromHash(hash: string): string | null {
  const raw = (hash || '').replace(/^#/, '')
  if (!raw) return null
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    /* hash malformado: usa como veio */
  }
  return SECTIONS.includes(id) ? id : null
}

/** Tentativas de chegada, em ms. A home carrega capa, vídeo e fontes: uma tentativa só
 *  acerta a posição de uma página que ainda vai se mexer. */
const ATTEMPTS = [120, 700, 1600]

/**
 * Chegar na home por `/#secao` — é o que o menu do blog e do painel fazem.
 *
 * O navegador processa a âncora ANTES de o React montar a seção, então a rolagem nativa
 * não acha destino e a pessoa cai no topo. Aqui a rolagem é refeita algumas vezes
 * enquanto o layout assenta — e para na hora em que a pessoa mexe na página, para nunca
 * arrancar a rolagem da mão de quem já está lendo.
 */
export function useHashLanding(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const id = sectionFromHash(window.location.hash)
    if (!id) return

    let done = false
    const stop = () => { done = true }
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    events.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }))

    const timers = ATTEMPTS.map((delay) =>
      window.setTimeout(() => { if (!done && document.getElementById(id)) scrollToId(id) }, delay),
    )

    return () => {
      timers.forEach(clearTimeout)
      events.forEach((ev) => window.removeEventListener(ev, stop))
    }
  }, [enabled])
}
