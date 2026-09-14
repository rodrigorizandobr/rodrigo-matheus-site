import { useCallback, useEffect, useState } from 'react'
import { fetchArena, type Arena } from '../data/api'

let cache: Promise<Arena> | null = null
const listeners = new Set<(a: Arena | null) => void>()

/** Test seam: forget the in-flight/settled request. */
export function resetArenaCache() { cache = null }

function load(): Promise<Arena> {
  cache ??= fetchArena()
  return cache
}

/**
 * One request per page load shared by every consumer (top strip, sync stamp, Arena section).
 * `refetch` drops the cache and notifies all of them, so a RETRY in the Arena also fixes the strip.
 */
export function useArena(): { arena: Arena | null; refetch: () => void } {
  const [arena, setArena] = useState<Arena | null>(null)

  useEffect(() => {
    listeners.add(setArena)
    let alive = true
    load().then((a) => { if (alive) setArena(a) })
    return () => { alive = false; listeners.delete(setArena) }
  }, [])

  const refetch = useCallback(() => {
    cache = null
    for (const l of listeners) l(null)
    load().then((a) => { for (const l of listeners) l(a) })
  }, [])

  return { arena, refetch }
}
