import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce, REST_ID, type StageEvent, type StageState } from './sceneMachine'
import { sceneFor, posterSrcSet, videoSrc, transitionSrc, linkSrc, stepToward, type Scene, type VideoSources } from './scenes'
import { planLayers } from './layerPlan'
import { CLIP_FADE_MS } from './timing'
import { useActiveSection } from './useActiveSection'
import { useMotionAllowed } from './media'
import { prefetchScenes } from './prefetch'

const ZOOM_IN_MS = 900
const ZOOM_OUT_MS = 700
const HOLD_MS = 450
/** transition clips are 8 s Veo takes re-timed to 2.5× / 60 fps at encode time (scripts/pack-transitions.mjs) */
const TRANSITION_MS = 8000 / 2.5
/** once a clip has STARTED, treat it as finished by then even if `ended` never fires */
const TRANSITION_MAX_MS = TRANSITION_MS + 1500
/** a clip that has not started by then (cold network) is abandoned → CSS zoom for that part */
const CLIP_LOAD_CAP_MS = 12000

/** one camera move: which clip, where it lands, what it looks at */
type Move = { key: string; src: (mobile: boolean) => VideoSources; pos: string; dir: 'in' | 'out' }
const reducer = (s: StageState, e: StageEvent) => reduce(s, e, stepToward)

/** the clip for the current phase: bust → part, part → part (neighbours), or part → bust */
function moveFor(state: StageState, scene: Scene | null): Move | null {
  if (!scene?.transition) return null
  if (state.phase === 'zoomIn') {
    const from = state.from ? sceneFor(state.from) : null
    if (from?.transition) return { key: `${from.part}-${scene.part}`, src: (m) => linkSrc(from, scene, m), pos: scene.position, dir: 'in' }
    return { key: `${scene.part}-in`, src: (m) => transitionSrc(scene, 'in', m), pos: scene.position, dir: 'in' }
  }
  if (state.phase === 'zoomOut') return { key: `${scene.part}-out`, src: (m) => transitionSrc(scene, 'out', m), pos: sceneFor(REST_ID).position, dir: 'out' }
  return null
}

/**
 * The persistent stage, on every device:
 *   desktop  — fixed behind the whole page
 *   mobile   — fixed band under the header; content scrolls beneath it
 * Layers: `rest` (the bust, still + idle loop) is always mounted. Every camera move is a CLIP played
 * on a `trans` layer, generated with first+last frame so it starts on the pixels of the layer it
 * leaves and ends on frame 0 of the loop it reveals: bust → part for the first section, PART → PART
 * between neighbouring sections (one camera, never back to the bust), part → bust (reversed) for
 * jumps. Scenes without clips fall back to a CSS zoom / crossfade.
 *
 * The clip's destination sits opaque UNDERNEATH it while it plays, so the clip is the ONLY layer
 * whose opacity moves: it eases in over the origin and eases out over the destination, same
 * duration both ends (CLIP_FADE_MS). One ramp, not two overlapping ones — two was what read as a
 * lighting artefact. planLayers keeps that invariant. Choreography rules live in sceneMachine.ts.
 *
 * Phones decode ONE video at a time: whichever layer is visible plays, the others are paused
 * (buffered, not decoding). Two concurrent decodes is what made the film stutter on a real phone.
 */
export function Stage() {
  const active = useActiveSection()
  const desktop = useIsDesktop()
  const [state, dispatch] = useReducer(reducer, REST_ID, initial)
  const motion = useMotionAllowed()
  // clips that failed to load → CSS fallback for that move for the rest of the session
  const [broken, setBroken] = useState<Record<string, true>>({})

  useEffect(() => { dispatch({ type: 'focus', section: active }) }, [active])

  // warm the cache with the clips in reading order once the page is idle
  useEffect(() => {
    if (!motion) return
    const ac = new AbortController()
    prefetchScenes(!desktop, ac.signal)
    return () => ac.abort()
  }, [motion, desktop])

  const scene = state.scene ? sceneFor(state.scene) : null
  const fromScene = state.phase === 'zoomIn' && state.from ? sceneFor(state.from) : null
  const move = moveFor(state, scene)
  const useClip = !!(move && motion && !broken[move.key])
  const travelling = state.phase === 'zoomIn' || state.phase === 'zoomOut'

  // has the current transition clip actually started playing?
  const [clipStarted, setClipStarted] = useState(false)
  useEffect(() => { setClipStarted(false) }, [state.phase, state.scene])
  // ...and is it already opaque? Revealing the destination during the clip's ease-in would flash the
  // arrival before the camera even travels.
  const [clipCovering, setClipCovering] = useState(false)
  useEffect(() => {
    if (!clipStarted) { setClipCovering(false); return }
    const t = window.setTimeout(() => setClipCovering(true), CLIP_FADE_MS)
    return () => clearTimeout(t)
  }, [clipStarted, state.phase, state.scene])

  // timers. CSS zoom: fixed durations. Clip: the current layer stays put (crisp, its loop playing)
  // until the clip is playing; only then does the "must have ended by" timer start. If it never
  // starts within the load cap, that part falls back to CSS zoom instead of jump-cutting.
  useEffect(() => {
    const ev = state.phase === 'zoomIn' ? 'zoomed' : state.phase === 'zoomOut' ? 'rested' : 'held'
    let ms: number | null = null
    if (state.phase === 'hold') ms = HOLD_MS
    else if (travelling && !useClip) ms = state.phase === 'zoomIn' ? ZOOM_IN_MS : ZOOM_OUT_MS
    else if (travelling && useClip && clipStarted) ms = TRANSITION_MAX_MS
    else if (travelling && useClip && !clipStarted) {
      const key = move?.key
      const t = window.setTimeout(() => { if (key) setBroken((b) => ({ ...b, [key]: true })) }, CLIP_LOAD_CAP_MS)
      return () => clearTimeout(t)
    }
    if (ms === null) return
    const t = window.setTimeout(() => dispatch({ type: ev }), ms)
    return () => clearTimeout(t)
  }, [state.phase, state.scene, state.pending, travelling, useClip, clipStarted, move?.key])

  // did the loop now on screen arrive by clip? decides cut (clip) vs fade (CSS fallback) at hand-over
  const [arrivedByClip, setArrivedByClip] = useState(false)
  useEffect(() => {
    if (state.phase === 'zoomIn') setArrivedByClip(useClip)
  }, [state.phase, state.scene, useClip])

  // When the clip ends it stays mounted and eases out over the destination, which is already opaque
  // underneath. Set in the SAME event as the phase change so the first render of the new phase still
  // has the layer mounted under the same key — a state that flipped later would remount and restart it.
  const [fadingMove, setFadingMove] = useState<Move | null>(null)
  useEffect(() => {
    if (!fadingMove) return
    const t = window.setTimeout(() => setFadingMove(null), CLIP_FADE_MS)
    return () => clearTimeout(t)
  }, [fadingMove])

  // stable identities: TransitionLayer keys its play() effect on these; new functions each render
  // would re-run it and restart an already-ended clip while it eases out
  const phaseRef = useRef(state.phase); phaseRef.current = state.phase
  const moveRef = useRef(move); moveRef.current = move
  const onClipEnded = useCallback(() => {
    const mv = moveRef.current
    if (phaseRef.current === 'zoomIn') { if (mv) setFadingMove(mv); dispatch({ type: 'zoomed' }) }
    else if (phaseRef.current === 'zoomOut') { if (mv) setFadingMove(mv); dispatch({ type: 'rested' }) }
  }, [])
  const onClipError = useCallback(() => { const key = moveRef.current?.key; if (key) setBroken((b) => ({ ...b, [key]: true })) }, [])

  // CSS fallback (clip missing/failed): zoom the bust when arriving from the bust
  const zoom = !useClip && !fromScene && (state.phase === 'zoomIn' || state.phase === 'show') ? scene?.zoom : null
  const showScene = state.phase === 'show'
  const plan = planLayers({ phase: state.phase, useClip, clipCovering, hasFrom: !!fromScene, arrivedByClip })

  return (
    <div
      className="stage fixed inset-x-0 overflow-hidden top-[var(--header-h)] h-[var(--stage-h)] lg:top-0 lg:h-auto lg:inset-0"
      aria-hidden="true"
      data-phase={state.phase}
      data-scene-active={showScene ? scene?.section : 'hero'}
    >
      <Layer
        scene={sceneFor(REST_ID)} rest visible={plan.restPlaying} mobile={!desktop}
        style={{ ['--zs' as string]: zoom ? zoom.scale : 1, ['--zo' as string]: zoom ? zoom.origin : '50% 30%', ['--zd' as string]: `${state.phase === 'zoomOut' ? ZOOM_OUT_MS : ZOOM_IN_MS}ms` }}
      />
      {fromScene && (
        <Layer key={fromScene.section} scene={fromScene} visible={plan.fromVisible} playing={plan.fromVisible} mobile={!desktop} instant />
      )}
      {scene && (travelling || showScene) && (
        <Layer key={scene.section} scene={scene} visible={plan.sceneVisible} playing={plan.scenePlaying} mobile={!desktop} instant={plan.sceneInstant} />
      )}
      {(() => {
        const live = move && useClip && travelling ? move : null
        const shown = live ?? (!travelling ? fadingMove : null)
        if (!shown) return null
        return (
          <TransitionLayer
            key={shown.key}
            src={shown.src(!desktop)}
            pos={shown.pos}
            fading={!live}
            onStarted={() => setClipStarted(true)}
            onEnded={onClipEnded}
            onError={onClipError}
          />
        )
      })()}
      <div className="portrait-scan" />
      <div className="portrait-vignette hidden lg:block" />
    </div>
  )
}

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setD(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return d
}

function Sources({ src }: { src: VideoSources }) {
  return (
    <>
      {src.webm && <source src={src.webm} type="video/webm" />}
      <source src={src.mp4} type="video/mp4" />
    </>
  )
}

function Layer({ scene, visible, playing = visible, rest = false, mobile, style, instant = false }: { scene: Scene; visible: boolean; playing?: boolean; rest?: boolean; mobile: boolean; style?: React.CSSProperties; instant?: boolean }) {
  const wantVideo = useMotionAllowed()
  const [ready, setReady] = useState(false)
  const [vid, setVid] = useState(false)
  const poster = posterSrcSet(scene)
  const v = videoSrc(scene, mobile)
  const ref = useRef<HTMLVideoElement>(null)

  // one decoding video at a time: a layer plays only while `playing`. A scene layer is mounted
  // (preload="auto", buffering, paused on its first frame = the clip's last frame) before it is
  // shown, so play() at hand-over is instant without having decoded alongside the clip.
  useEffect(() => {
    const el = ref.current
    if (!el || !wantVideo) return
    if (playing) { el.play().catch(() => {}) } else { el.pause() }
  }, [playing, wantVideo, vid])

  return (
    <div className={`stage-layer absolute inset-0 ${rest ? 'stage-rest' : 'stage-scene'}`} data-visible={visible} data-ready={ready} data-video={vid} data-instant={instant} style={{ ['--pos' as string]: scene.position, ...style }}>
      <img src={poster.src} srcSet={poster.srcSet} sizes="100vw" alt="" decoding="async"
           loading={rest ? 'eager' : 'lazy'} fetchPriority={rest ? 'high' : 'auto'} onLoad={() => setReady(true)} className="stage-img" />
      {wantVideo && scene.video !== false && (
        <video key={mobile ? 'm' : 'd'} ref={ref} className="stage-video" autoPlay={rest} muted loop playsInline preload="auto" disablePictureInPicture
               onCanPlay={() => setVid(true)} onError={() => setVid(false)}>
          <Sources src={v} />
        </video>
      )}
      {scene.glow && <div className="portrait-glow" style={{ left: scene.glow.left, top: scene.glow.top, width: scene.glow.width }} />}
    </div>
  )
}

/** Plays one camera-move clip once. Visible from its first decoded frame until it ends. */
function TransitionLayer({ src, pos, fading = false, onStarted, onEnded, onError }: { src: VideoSources; pos: string; fading?: boolean; onStarted?: () => void; onEnded: () => void; onError: () => void }) {
  const [ready, setReady] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || fading || v.ended) return
    v.play().catch(() => onError())
  }, [onError, fading])
  return (
    <div className="stage-layer stage-trans absolute inset-0" data-visible={ready && !fading} data-ready={ready} data-fading={fading}>
      <video ref={ref} className="stage-video stage-trans-video" muted playsInline autoPlay preload="auto" disablePictureInPicture
             style={{ ['--pos' as string]: pos }}
             onPlaying={() => { setReady(true); onStarted?.() }} onEnded={onEnded} onError={onError}>
        <Sources src={src} />
      </video>
    </div>
  )
}
