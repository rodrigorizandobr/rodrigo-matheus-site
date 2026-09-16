import { useArena } from '../../hooks/useArena'
import { useCountUp } from '../../hooks/useCountUp'
import { summarize } from '../../data/api'
import type { Dictionary } from '../../i18n/types'
import { IconCommit, IconRepo, IconSignal } from '../ui/Icons'

/**
 * A faixa de indicadores do topo do hero. Todo número é real: repos e commits de 28
 * dias vêm de /api/data (GitHub) e o "LINK" é o estado de verdade da API.
 *
 * Aqui já houve um rótulo "SELEÇÃO DE PERSONAGEM" com uma seta de voltar, herdado da
 * referência de tela de jogo. Saiu: o site é um portfólio, a seta não levava a lugar
 * nenhum, e sem ele o cartão da esquerda sobe e encosta no topo da coluna.
 */
export function TopStrip({ hud }: { hud: Dictionary['hud'] }) {
  const { arena } = useArena()
  const sum = arena ? summarize(arena.repos) : null
  const repos = useCountUp(sum?.repos ?? 0)
  const commits = useCountUp(sum?.commits28d ?? 0)
  const state: 'syncing' | 'online' | 'offline' = !arena ? 'syncing' : arena.status
  const label = state === 'syncing' ? hud.top.syncing : state === 'online' ? hud.top.online : hud.top.offline

  return (
    <div className="flex items-center justify-end gap-3 text-heading" data-testid="top-strip">
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label={`${hud.top.link}: ${label}`}>
        <span className="chip"><IconRepo width={14} height={14} /><b className="hud-num text-[13px]">{sum ? repos : '—'}</b><span className="hud-label !text-[9.5px]">{hud.top.repos}</span></span>
        <span className="chip"><IconCommit width={14} height={14} /><b className="hud-num text-[13px]">{sum ? commits : '—'}</b><span className="hud-label !text-[9.5px]">{hud.top.commits}</span></span>
        <span className="chip" data-state={state}>
          <span className="chip-dot" aria-hidden="true" />
          <IconSignal width={14} height={14} level={state === 'online' ? 3 : state === 'syncing' ? 1 : 0} />
          <span className="hud-label !text-[9.5px]">{label}</span>
        </span>
      </div>
    </div>
  )
}
