import { useArena } from '../../hooks/useArena'
import { timeAgo } from '../../data/repos'
import type { Dictionary } from '../../i18n/types'

/** Bottom-right status stamp: when Rodrigo last pushed code, straight from the GitHub payload. */
export function SyncStamp({ t }: { t: Dictionary }) {
  const { arena } = useArena()
  const last = arena?.repos.map((r) => r.pushed_at).filter(Boolean).sort().pop()
  const when = last ? timeAgo(last, t.projects.time_ago) : '—'
  return (
    <span className="font-mono text-[10px] text-muted inline-flex items-center gap-2">
      <span className="uppercase tracking-wider">{t.hud.sync.last_commit}</span>
      <span className="text-heading">{when}</span>
      <span aria-hidden="true">·</span>
      <span className="uppercase tracking-wider">{t.hud.sync.build}</span>
      <span className="text-heading">v3</span>
    </span>
  )
}
