/**
 * Stage choreography, pure. The resting bust is always underneath; a section's close-up loop is
 * reached by a camera move (zoomIn) that lands on that body part; leaving moves back (zoomOut).
 *
 *   rest ──focus──▶ zoomIn ──zoomed──▶ show ──focus(other)──▶ zoomOut ──rested──▶ rest | hold ──held──▶ zoomIn(next)
 *   (`hold` is the beat at the resting pose the eye needs to register "back to default" before the next zoom)
 *
 * ONE CAMERA: when `direct(a, b)` says two scenes are neighbours, leaving `a` for `b` is a single
 * zoomIn with `from: a` — the camera travels part → part and never returns to the bust. Only jumps
 * (menu clicks across the page) go through the bust.
 */
export type SceneId = string
export type Phase = 'rest' | 'zoomIn' | 'show' | 'zoomOut' | 'hold'
/** `from`: set on a zoomIn that starts at another part's close-up instead of the bust */
export type StageState = { phase: Phase; scene: SceneId | null; pending: SceneId | null; from?: SceneId }
export type StageEvent = { type: 'focus'; section: SceneId } | { type: 'zoomed' } | { type: 'rested' } | { type: 'held' }
export type Direct = (a: SceneId, b: SceneId) => boolean
const never: Direct = () => false

export const REST_ID: SceneId = 'hero'

export const initial = (section: SceneId = REST_ID): StageState =>
  section === REST_ID ? { phase: 'rest', scene: null, pending: null } : { phase: 'zoomIn', scene: section, pending: null }

export function reduce(s: StageState, e: StageEvent, direct: Direct = never): StageState {
  switch (e.type) {
    case 'focus': {
      const target = e.section === REST_ID ? null : e.section
      switch (s.phase) {
        case 'rest':
          return target ? { phase: 'zoomIn', scene: target, pending: null } : s
        case 'zoomIn':
          return s.scene === target ? { ...s, pending: null } : { ...s, pending: target }
        case 'show':
          if (s.scene === target) return s
          if (target && s.scene && direct(s.scene, target)) return { phase: 'zoomIn', scene: target, from: s.scene, pending: null }
          return { phase: 'zoomOut', scene: s.scene, pending: target }
        case 'zoomOut':
          if (target && target === s.scene) return { phase: 'zoomIn', scene: target, pending: null } // came back: cancel the exit
          return s.pending === target ? s : { ...s, pending: target }
        case 'hold':
          return target ? (s.pending === target ? s : { ...s, pending: target }) : { phase: 'rest', scene: null, pending: null }
      }
      return s
    }
    case 'zoomed': {
      if (s.phase !== 'zoomIn') return s
      if (s.pending === null || s.pending === s.scene) return { phase: 'show', scene: s.scene, pending: null }
      if (s.scene && direct(s.scene, s.pending)) return { phase: 'zoomIn', scene: s.pending, from: s.scene, pending: null }
      return { phase: 'zoomOut', scene: s.scene, pending: s.pending }
    }
    case 'rested':
      if (s.phase !== 'zoomOut') return s
      return s.pending ? { phase: 'hold', scene: null, pending: s.pending } : { phase: 'rest', scene: null, pending: null }
    case 'held':
      if (s.phase !== 'hold') return s
      return s.pending ? { phase: 'zoomIn', scene: s.pending, pending: null } : { phase: 'rest', scene: null, pending: null }
  }
}

/** Given per-section visibility ratios (of the viewport's centre band), pick the one in charge. */
export function resolveActive(entries: { id: SceneId; ratio: number }[], current: SceneId, min = 0.1): SceneId {
  let best: { id: SceneId; ratio: number } | null = null
  for (const e of entries) if (e.ratio >= min && (!best || e.ratio > best.ratio)) best = e
  return best ? best.id : current
}
