/**
 * Stage choreography, pure. The resting bust is always underneath; a section's close-up loop is
 * reached by a camera move (zoomIn) that lands on that body part; leaving moves back (zoomOut).
 *
 *   rest ──focus──▶ zoomIn ──zoomed──▶ show ──focus(other)──▶ zoomOut ──rested──▶ rest | hold ──held──▶ zoomIn(next)
 *   (`hold` is the beat at the resting pose the eye needs to register "back to default" before the next zoom)
 *
 * ONE CAMERA: `step(a, b)` gives the NEXT part on the way from `a` to `b`. Leaving `a` becomes a
 * zoomIn with `from: a`, and on landing the machine asks for the next step and splices the following
 * leg — so going from the last section back to the first RETRACES the path (hands → fist → brain →
 * core → neck → eyes) instead of cutting to the bust. Only the bust itself (hero) is reached by the
 * part → bust clip, because that is the clip that exists.
 */
export type SceneId = string
export type Phase = 'rest' | 'zoomIn' | 'show' | 'zoomOut' | 'hold'
/** `from`: set on a zoomIn that starts at another part's close-up instead of the bust */
export type StageState = { phase: Phase; scene: SceneId | null; pending: SceneId | null; from?: SceneId }
export type StageEvent = { type: 'focus'; section: SceneId } | { type: 'zoomed' } | { type: 'rested' } | { type: 'held' }
/** Próximo passo no caminho de `a` até `b`, ou null quando não há clipe direto. */
export type Step = (a: SceneId, b: SceneId) => SceneId | null
const noStep: Step = () => null

export const REST_ID: SceneId = 'hero'

export const initial = (section: SceneId = REST_ID): StageState =>
  section === REST_ID ? { phase: 'rest', scene: null, pending: null } : { phase: 'zoomIn', scene: section, pending: null }

/** `pending` guarda o DESTINO, inclusive o topo; só o que entra em `zoomOut` vira null. */
const exitPending = (target: SceneId) => (target === REST_ID ? null : target)

export function reduce(s: StageState, e: StageEvent, step: Step = noStep): StageState {
  switch (e.type) {
    case 'focus': {
      const target = e.section
      switch (s.phase) {
        case 'rest':
          // do busto a câmera alcança qualquer parte direto — o clipe busto → parte existe
          return target === REST_ID ? s : { phase: 'zoomIn', scene: target, pending: null }
        case 'zoomIn':
          // O destino fica guardado MESMO sendo o topo. Zerar aqui era o bug da rolagem
          // rápida: o último foco da subida é o hero, e ele apagava o caminho de volta.
          return s.scene === target ? { ...s, pending: null } : { ...s, pending: target }
        case 'show': {
          if (s.scene === target) return s
          const next = s.scene ? step(s.scene, target) : null
          if (next) return { phase: 'zoomIn', scene: next, from: s.scene!, pending: next === target ? null : target }
          return { phase: 'zoomOut', scene: s.scene, pending: exitPending(target) }
        }
        case 'zoomOut':
          if (target !== REST_ID && target === s.scene) return { phase: 'zoomIn', scene: target, pending: null } // voltou: cancela a saída
          return s.pending === exitPending(target) ? s : { ...s, pending: exitPending(target) }
        case 'hold':
          return target === REST_ID
            ? { phase: 'rest', scene: null, pending: null }
            : (s.pending === target ? s : { ...s, pending: target })
      }
      return s
    }
    case 'zoomed': {
      if (s.phase !== 'zoomIn') return s
      if (s.pending === null || s.pending === s.scene) return { phase: 'show', scene: s.scene, pending: null }
      const next = s.scene ? step(s.scene, s.pending) : null
      if (next) return { phase: 'zoomIn', scene: next, from: s.scene!, pending: next === s.pending ? null : s.pending }
      return { phase: 'zoomOut', scene: s.scene, pending: exitPending(s.pending) }
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
