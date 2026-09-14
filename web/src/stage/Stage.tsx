import { useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce, REST_ID } from './sceneMachine'
import { sceneFor, posterSrcSet, videoSrc, type Scene } from './scenes'
import { useActiveSection } from './useActiveSection'
import { useMotionAllowed } from './media'

const ZOOM_IN_MS = 900
const ZOOM_OUT_MS = 700
const HOLD_MS = 450

/**
 * The persistent stage, on every device:
 *   desktop  — fixed behind the whole page
 *   mobile   — fixed band under the header; content scrolls beneath it
 * Layers: `rest` (the bust, still + idle loop) is always mounted and is what gets ZOOMED toward the
 * active section's body part; the `scene` layer (that part's close-up loop) fades in at the end of
 * the zoom and out at the start of the zoom back. Choreography rules live in sceneMachine.ts.
 */
export function Stage() {
  const active = useActiveSection()
  const desktop = useIsDesktop()
  const [state, dispatch] = useReducer(reduce, REST_ID, initial)

  useEffect(() => { dispatch({ type: 'focus', section: active }) }, [active])

  useEffect(() => {
    if (state.phase === 'zoomIn') { const t = window.setTimeout(() => dispatch({ type: 'zoomed' }), ZOOM_IN_MS); return () => clearTimeout(t) }
    if (state.phase === 'zoomOut') { const t = window.setTimeout(() => dispatch({ type: 'rested' }), ZOOM_OUT_MS); return () => clearTimeout(t) }
    if (state.phase === 'hold') { const t = window.setTimeout(() => dispatch({ type: 'held' }), HOLD_MS); return () => clearTimeout(t) }
  }, [state.phase, state.scene, state.pending])

  const scene = state.scene ? sceneFor(state.scene) : null
  const zoom = state.phase === 'zoomIn' || state.phase === 'show' ? scene?.zoom : null
  const showScene = state.phase === 'show'
  const warmScene = state.phase === 'zoomIn' // mount early so the loop is ready when the zoom lands

  return (
    <div
      className="stage fixed inset-x-0 z-0 overflow-hidden top-[var(--header-h)] h-[var(--stage-h)] lg:top-0 lg:h-auto lg:inset-0"
      aria-hidden="true"
      data-phase={state.phase}
      data-scene-active={showScene ? scene?.section : 'hero'}
    >
      <Layer
        scene={sceneFor(REST_ID)} rest visible={!showScene} mobile={!desktop}
        style={{ ['--zs' as string]: zoom ? zoom.scale : 1, ['--zo' as string]: zoom ? zoom.origin : '50% 30%', ['--zd' as string]: `${state.phase === 'zoomOut' ? ZOOM_OUT_MS : ZOOM_IN_MS}ms` }}
      />
      {scene && (warmScene || showScene || state.phase === 'zoomOut') && (
        <Layer key={scene.section} scene={scene} visible={showScene} mobile={!desktop} />
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

function Layer({ scene, visible, rest = false, mobile, style }: { scene: Scene; visible: boolean; rest?: boolean; mobile: boolean; style?: React.CSSProperties }) {
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
    <div className={`stage-layer absolute inset-0 ${rest ? 'stage-rest' : 'stage-scene'}`} data-visible={visible} data-ready={ready} data-video={vid} style={{ ['--pos' as string]: scene.position, ...style }}>
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
