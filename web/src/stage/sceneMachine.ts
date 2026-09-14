/**
 * The persistent robot stage: which body part is under examination, and the "rest between focuses"
 * choreography the PO asked for — leave a section → back to the resting bust → then the next part.
 * Pure, so the timing/observer glue can be swapped without touching the rules.
 */
export type SceneId = string // section id; 'hero' is the resting pose
export type Phase = 'showing' | 'resting'
export type StageState = { phase: Phase; scene: SceneId | null; pending: SceneId | null }
export type StageEvent = { type: 'focus'; section: SceneId } | { type: 'rested' }

export const REST_ID: SceneId = 'hero'

export const initial = (section: SceneId = REST_ID): StageState => ({ phase: 'showing', scene: section === REST_ID ? null : section, pending: null })

export function reduce(s: StageState, e: StageEvent): StageState {
  switch (e.type) {
    case 'focus': {
      const target = e.section === REST_ID ? null : e.section
      if (s.phase === 'showing' && s.scene === target) return s
      if (s.phase === 'resting') return s.pending === target ? s : { ...s, pending: target }
      return { phase: 'resting', scene: null, pending: target }
    }
    case 'rested':
      return s.phase === 'resting' ? { phase: 'showing', scene: s.pending, pending: null } : s
  }
}

/** Given per-section visibility ratios (of the viewport's centre band), pick the one in charge. */
export function resolveActive(entries: { id: SceneId; ratio: number }[], current: SceneId, min = 0.1): SceneId {
  let best: { id: SceneId; ratio: number } | null = null
  for (const e of entries) if (e.ratio >= min && (!best || e.ratio > best.ratio)) best = e
  return best ? best.id : current
}
