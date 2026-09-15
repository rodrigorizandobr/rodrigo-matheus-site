import type { Dictionary } from '../../i18n/types'

/**
 * Atalhos de teclado. Cada um aqui é uma PROMESSA: só entra o que existe de verdade.
 * As setas saíram junto com a lista de classes — anunciar uma tecla que não faz nada é
 * pior do que não anunciar nenhuma.
 */
export function HintsBar({ hud }: { hud: Dictionary['hud'] }) {
  const Key = ({ k }: { k: string }) => <kbd className="kbd">{k}</kbd>
  return (
    <div className="hidden lg:flex items-center gap-5 font-mono text-[10px] text-muted" aria-label="keyboard shortcuts">
      <span className="flex items-center gap-1.5"><Key k="↵" /><span className="ml-1 uppercase tracking-wider">{hud.hints.start}</span></span>
      <span className="flex items-center gap-1.5"><Key k="L" /><span className="ml-1 uppercase tracking-wider">{hud.hints.lang}</span></span>
    </div>
  )
}
