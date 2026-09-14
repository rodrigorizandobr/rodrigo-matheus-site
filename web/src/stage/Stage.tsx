import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce, REST_ID } from './sceneMachine'
import { sceneFor, posterSrcSet, videoSrc, transitionSrc, type Scene } from './scenes'
import { useActiveSection } from './useActiveSection'
import { useMotionAllowed } from './media'
import { prefetchScenes } from './prefetch'

const ZOOM_IN_MS = 900
const ZOOM_OUT_MS = 700
const HOLD_MS = 450
/** after a clip lands, keep it fading over the loop for this long — hides any residual mismatch */
const LINGER_MS = 400
/** clips are 8 s; played faster they still read as one continuous camera move at 24 fps */
const TRANSITION_RATE = 2.2
/** once a clip has STARTED, treat it as finished by then even if `ended` never fires */
const TRANSITION_MAX_MS = 8000 / TRANSITION_RATE + 1500
/** a clip that has not started by then (cold network) is abandoned → CSS zoom for that part */
const CLIP_LOAD_CAP_MS = 12000

/**
 * The persistent stage, on every device:
 *   desktop  — fixed behind the whole page
 *   mobile   — fixed band under the header; content scrolls beneath it
 * Layers: `rest` (the bust, still + idle loop) is always mounted. Reaching a section's body part is
 * a TRANSITION CLIP (bust → part, generated with first+last frame so its last frame is the loop's
 * first) played on a `trans` layer; leaving plays the same clip reversed. Scenes without clips fall
 * back to a CSS zoom of the bust. Choreography rules live in sceneMachine.ts.
 */
export function Stage() {
  const active = useActiveSection()
  const desktop = useIsDesktop()
  const [state, dispatch] = useReducer(reduce, REST_ID, initial)
  const motion = useMotionAllowed()
  // parts whose transition clip failed to load → CSS zoom for the rest of the session
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
  const useClip = !!(scene?.transition && motion && !broken[scene.part])

  // has the current transition clip actually started playing?
  const [clipStarted, setClipStarted] = useState(false)
  useEffect(() => { setClipStarted(false) }, [state.phase, state.scene])

  // timers. CSS zoom: fixed durations. Clip: the bust stays put (crisp, idle playing) until the clip
  // is playing; only then does the "must have ended by" timer start. If it never starts within the
  // load cap, that part falls back to CSS zoom instead of jump-cutting to the loop.
  useEffect(() => {
    const travelling = state.phase === 'zoomIn' || state.phase === 'zoomOut'
    const ev = state.phase === 'zoomIn' ? 'zoomed' : state.phase === 'zoomOut' ? 'rested' : 'held'
    let ms: number | null = null
    if (state.phase === 'hold') ms = HOLD_MS
    else if (travelling && !useClip) ms = state.phase === 'zoomIn' ? ZOOM_IN_MS : ZOOM_OUT_MS
    else if (travelling && useClip && clipStarted) ms = TRANSITION_MAX_MS
    else if (travelling && useClip && !clipStarted) {
      const part = scene?.part
      const t = window.setTimeout(() => { if (part) setBroken((b) => ({ ...b, [part]: true })) }, CLIP_LOAD_CAP_MS)
      return () => clearTimeout(t)
    }
    if (ms === null) return
    const t = window.setTimeout(() => dispatch({ type: ev }), ms)
    return () => clearTimeout(t)
  }, [state.phase, state.scene, state.pending, useClip, clipStarted, scene?.part])

  // stable identities: TransitionLayer keys its play() effect on these; new functions each render
  // would re-run it and restart an already-ended clip during the linger
  const phaseRef = useRef(state.phase); phaseRef.current = state.phase
  const onClipEnded = useCallback(() => {
    if (phaseRef.current === 'zoomIn') dispatch({ type: 'zoomed' })
    else if (phaseRef.current === 'zoomOut') dispatch({ type: 'rested' })
  }, [])
  const partRef = useRef(scene?.part); partRef.current = scene?.part
  const onClipError = useCallback(() => { const part = partRef.current; if (part) setBroken((b) => ({ ...b, [part]: true })) }, [])

  const zoom = !useClip && (state.phase === 'zoomIn' || state.phase === 'show') ? scene?.zoom : null
  const showScene = state.phase === 'show'
  const warmScene = state.phase === 'zoomIn' // mount early so the loop is ready when the zoom lands
  const transDir = state.phase === 'zoomIn' ? 'in' : state.phase === 'zoomOut' ? 'out' : null
  // when an 'in' clip lands, keep it mounted (fading) over the now-visible loop for LINGER_MS.
  // Modelled as "linger is done" so the very first render of `show` still has the layer mounted —
  // a state that starts false and flips true would unmount/remount the video (and restart it).
  const [lingerDone, setLingerDone] = useState(false)
  useEffect(() => {
    if (state.phase !== 'show') { setLingerDone(false); return }
    const t = window.setTimeout(() => setLingerDone(true), LINGER_MS)
    return () => clearTimeout(t)
  }, [state.phase, state.scene])
  const linger = state.phase === 'show' && !lingerDone

  return (
    <div
      className="stage fixed inset-x-0 overflow-hidden top-[var(--header-h)] h-[var(--stage-h)] lg:top-0 lg:h-auto lg:inset-0"
      aria-hidden="true"
      data-phase={state.phase}
      data-scene-active={showScene ? scene?.section : 'hero'}
    >
      <Layer
        scene={sceneFor(REST_ID)} rest visible={!showScene && !(useClip && transDir && clipStarted)} mobile={!desktop}
        style={{ ['--zs' as string]: zoom ? zoom.scale : 1, ['--zo' as string]: zoom ? zoom.origin : '50% 30%', ['--zd' as string]: `${state.phase === 'zoomOut' ? ZOOM_OUT_MS : ZOOM_IN_MS}ms` }}
      />
      {scene && (warmScene || showScene || state.phase === 'zoomOut') && (
        <Layer key={scene.section} scene={scene} visible={showScene} mobile={!desktop} instant={useClip} />
      )}
      {scene && useClip && (transDir || linger) && (
        <TransitionLayer
          key={`${scene.section}-${transDir ?? 'in'}`}
          scene={scene}
          dir={transDir ?? 'in'}
          mobile={!desktop}
          fading={!transDir}
          onStarted={() => setClipStarted(true)}
          onEnded={onClipEnded}
          onError={onClipError}
        />
      )}
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

function Layer({ scene, visible, rest = false, mobile, style, instant = false }: { scene: Scene; visible: boolean; rest?: boolean; mobile: boolean; style?: React.CSSProperties; instant?: boolean }) {
  const wantVideo = useMotionAllowed()
  const [ready, setReady] = useState(false)
  const [vid, setVid] = useState(false)
  const poster = posterSrcSet(scene)
  const v = videoSrc(scene, mobile)
  const ref = useRef<HTMLVideoElement>(null)

  // one decoding loop at a time: play when this layer is (about to be) visible, pause otherwise
  useEffect(() => {
    const el = ref.current
    if (!el || !wantVideo) return
    if (visible || !rest) { el.play().catch(() => {}) } else { el.pause() }
  }, [visible, rest, wantVideo, vid])

  return (
    <div className={`stage-layer absolute inset-0 ${rest ? 'stage-rest' : 'stage-scene'}`} data-visible={visible} data-ready={ready} data-video={vid} data-instant={instant} style={{ ['--pos' as string]: scene.position, ...style }}>
      <img src={poster.src} srcSet={poster.srcSet} sizes="100vw" alt="" decoding="async"
           loading={rest ? 'eager' : 'lazy'} fetchPriority={rest ? 'high' : 'auto'} onLoad={() => setReady(true)} className="stage-img" />
      {wantVideo && scene.video !== false && (
        <video key={mobile ? 'm' : 'd'} ref={ref} className="stage-video" autoPlay={rest} muted loop playsInline preload={rest ? 'auto' : 'metadata'} disablePictureInPicture
               onCanPlay={() => setVid(true)} onError={() => setVid(false)}>
          <source src={v.webm} type="video/webm" />
          <source src={v.mp4} type="video/mp4" />
        </video>
      )}
      {scene.glow && <div className="portrait-glow" style={{ left: scene.glow.left, top: scene.glow.top, width: scene.glow.width }} />}
    </div>
  )
}

/** Plays a bust→part clip once (or its reverse). Visible from its first decoded frame until it ends. */
function TransitionLayer({ scene, dir, mobile, fading = false, onStarted, onEnded, onError }: { scene: Scene; dir: 'in' | 'out'; mobile: boolean; fading?: boolean; onStarted?: () => void; onEnded: () => void; onError: () => void }) {
  const [ready, setReady] = useState(false)
  const src = transitionSrc(scene, dir, mobile)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || fading || v.ended) return
    v.playbackRate = TRANSITION_RATE
    v.play().catch(() => onError())
  }, [onError, fading])
  return (
    <div className="stage-layer stage-trans absolute inset-0" data-visible={ready && !fading} data-ready={ready} data-fading={fading}>
      <video ref={ref} className="stage-video stage-trans-video" muted playsInline autoPlay preload="auto" disablePictureInPicture
             style={{ ['--pos' as string]: dir === 'in' ? scene.position : sceneFor(REST_ID).position }}
             onPlaying={() => { setReady(true); onStarted?.() }} onEnded={onEnded} onError={onError}>
        <source src={src.webm} type="video/webm" />
        <source src={src.mp4} type="video/mp4" />
      </video>
    </div>
  )
}
