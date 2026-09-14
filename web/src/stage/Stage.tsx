import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce, REST_ID } from './sceneMachine'
import { sceneFor, posterSrcSet, videoSrc, transitionSrc, type Scene, type VideoSources } from './scenes'
import { useActiveSection } from './useActiveSection'
import { useMotionAllowed } from './media'
import { prefetchScenes } from './prefetch'

const ZOOM_IN_MS = 900
const ZOOM_OUT_MS = 700
const HOLD_MS = 450
/** after a clip lands, keep it fading over the layer underneath for this long — hides any residual mismatch */
const LINGER_MS = 400
/** transition clips are 8 s Veo takes re-timed to 2.2× at encode time (scripts/pack-transitions.mjs) */
const TRANSITION_MS = 8000 / 2.2
/** once a clip has STARTED, treat it as finished by then even if `ended` never fires */
const TRANSITION_MAX_MS = TRANSITION_MS + 1500
/** a clip that has not started by then (cold network) is abandoned → CSS zoom for that part */
const CLIP_LOAD_CAP_MS = 12000

type Landed = { scene: Scene; dir: 'in' | 'out' }

/**
 * The persistent stage, on every device:
 *   desktop  — fixed behind the whole page
 *   mobile   — fixed band under the header; content scrolls beneath it
 * Layers: `rest` (the bust, still + idle loop) is always mounted. Reaching a section's body part is
 * a TRANSITION CLIP (bust → part, generated with first+last frame so its last frame is the loop's
 * first) played on a `trans` layer; leaving plays the same clip reversed. Scenes without clips fall
 * back to a CSS zoom of the bust. Choreography rules live in sceneMachine.ts.
 *
 * Phones decode ONE video at a time: whichever layer is visible plays, the others are paused
 * (buffered, not decoding). Two concurrent decodes is what made the film stutter on a real phone.
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
  const travelling = state.phase === 'zoomIn' || state.phase === 'zoomOut'

  // has the current transition clip actually started playing?
  const [clipStarted, setClipStarted] = useState(false)
  useEffect(() => { setClipStarted(false) }, [state.phase, state.scene])

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
      const part = scene?.part
      const t = window.setTimeout(() => { if (part) setBroken((b) => ({ ...b, [part]: true })) }, CLIP_LOAD_CAP_MS)
      return () => clearTimeout(t)
    }
    if (ms === null) return
    const t = window.setTimeout(() => dispatch({ type: ev }), ms)
    return () => clearTimeout(t)
  }, [state.phase, state.scene, state.pending, travelling, useClip, clipStarted, scene?.part])

  // When a clip ends it stays mounted, fading, over the layer that took over (loop after 'in', bust
  // after 'out'). `landed` is set in the same event as the phase change so the very first render of
  // the new phase still has the layer mounted under the same key — no unmount/remount, no restart.
  const [landed, setLanded] = useState<Landed | null>(null)
  useEffect(() => {
    if (!landed) return
    const t = window.setTimeout(() => setLanded(null), LINGER_MS)
    return () => clearTimeout(t)
  }, [landed])

  // stable identities: TransitionLayer keys its play() effect on these; new functions each render
  // would re-run it and restart an already-ended clip during the linger
  const phaseRef = useRef(state.phase); phaseRef.current = state.phase
  const sceneRef = useRef(scene); sceneRef.current = scene
  const onClipEnded = useCallback(() => {
    const sc = sceneRef.current
    if (phaseRef.current === 'zoomIn') { if (sc) setLanded({ scene: sc, dir: 'in' }); dispatch({ type: 'zoomed' }) }
    else if (phaseRef.current === 'zoomOut') { if (sc) setLanded({ scene: sc, dir: 'out' }); dispatch({ type: 'rested' }) }
  }, [])
  const onClipError = useCallback(() => { const part = sceneRef.current?.part; if (part) setBroken((b) => ({ ...b, [part]: true })) }, [])

  const zoom = !useClip && (state.phase === 'zoomIn' || state.phase === 'show') ? scene?.zoom : null
  const showScene = state.phase === 'show'
  const transDir = state.phase === 'zoomIn' ? 'in' : state.phase === 'zoomOut' ? 'out' : null
  const clipCovers = useClip && transDir !== null && clipStarted
  // who is on screen: the clip once it plays; before that, whoever was there. The bust layer is the
  // opaque floor (its `visible` only drives play/pause). On the way out the loop stays visible under
  // the clip — paused once the clip plays — otherwise the return would flash the bust first.
  const restVisible = !clipCovers && !showScene && !(useClip && state.phase === 'zoomOut')
  const sceneVisible = showScene || (useClip && state.phase === 'zoomOut')
  const scenePlaying = sceneVisible && !clipCovers
  const trans: Landed | null = scene && useClip && transDir ? { scene, dir: transDir } : landed

  return (
    <div
      className="stage fixed inset-x-0 overflow-hidden top-[var(--header-h)] h-[var(--stage-h)] lg:top-0 lg:h-auto lg:inset-0"
      aria-hidden="true"
      data-phase={state.phase}
      data-scene-active={showScene ? scene?.section : 'hero'}
    >
      <Layer
        scene={sceneFor(REST_ID)} rest visible={restVisible} mobile={!desktop}
        style={{ ['--zs' as string]: zoom ? zoom.scale : 1, ['--zo' as string]: zoom ? zoom.origin : '50% 30%', ['--zd' as string]: `${state.phase === 'zoomOut' ? ZOOM_OUT_MS : ZOOM_IN_MS}ms` }}
      />
      {scene && (travelling || showScene) && (
        <Layer key={scene.section} scene={scene} visible={sceneVisible} playing={scenePlaying} mobile={!desktop} instant={useClip} />
      )}
      {trans && (
        <TransitionLayer
          key={`${trans.scene.section}-${trans.dir}`}
          scene={trans.scene}
          dir={trans.dir}
          mobile={!desktop}
          fading={transDir === null}
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

/** Plays a bust→part clip once (or its reverse). Visible from its first decoded frame until it ends. */
function TransitionLayer({ scene, dir, mobile, fading = false, onStarted, onEnded, onError }: { scene: Scene; dir: 'in' | 'out'; mobile: boolean; fading?: boolean; onStarted?: () => void; onEnded: () => void; onError: () => void }) {
  const [ready, setReady] = useState(false)
  const src = transitionSrc(scene, dir, mobile)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || fading || v.ended) return
    v.play().catch(() => onError())
  }, [onError, fading])
  return (
    <div className="stage-layer stage-trans absolute inset-0" data-visible={ready && !fading} data-ready={ready} data-fading={fading}>
      <video ref={ref} className="stage-video stage-trans-video" muted playsInline autoPlay preload="auto" disablePictureInPicture
             style={{ ['--pos' as string]: dir === 'in' ? scene.position : sceneFor(REST_ID).position }}
             onPlaying={() => { setReady(true); onStarted?.() }} onEnded={onEnded} onError={onError}>
        <Sources src={src} />
      </video>
    </div>
  )
}
