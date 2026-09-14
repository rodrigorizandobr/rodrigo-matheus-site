/** /api/data client. The hero must never wait on it (ADR-10): i18n is bundled, the API only enriches. */
import type { Repo } from './repos'

export type ArenaStatus = 'online' | 'offline'
export type Arena = { status: ArenaStatus; repos: Repo[] }
export type ArenaSummary = { repos: number; commits28d: number; stars: number }

export async function fetchArena(timeoutMs = 8000): Promise<Arena> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch('/api/data', { signal: ctl.signal, headers: { accept: 'application/json' } })
    if (!res.ok) return { status: 'offline', repos: [] }
    const json = (await res.json()) as { repos?: Repo[] }
    return { status: 'online', repos: Array.isArray(json.repos) ? json.repos : [] }
  } catch {
    return { status: 'offline', repos: [] }
  } finally {
    clearTimeout(timer)
  }
}

export function summarize(repos: Repo[]): ArenaSummary {
  return repos.reduce(
    (a, r) => ({ repos: a.repos + 1, commits28d: a.commits28d + (r.sparkline?.commits ?? 0), stars: a.stars + (r.stargazers_count ?? 0) }),
    { repos: 0, commits28d: 0, stars: 0 },
  )
}
