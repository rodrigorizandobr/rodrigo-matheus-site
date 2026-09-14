import { useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce, REST_ID } from './sceneMachine'
import { sceneFor, posterSrcSet, videoSrc, type Scene } from './scenes'
import { useActiveSection } from './useActiveSection'

const REST_MS = 520      // how long the resting bust holds between two focuses
const SCENE_FADE_MS = 700

/**
 * Desktop-only persistent stage, fixed behind the whole page. Two layers:
 *   rest  — the hero bust (still + idle loop), always mounted, visible whenever no scene is showing
 *   scene — the body part under examination for the active section, crossfaded in/out
 * Leaving a section returns to rest, then the next part fades in (sceneMachine).
 */
/** Mounted only on desktop widths: a display:none stage would still fetch and decode its videos. */
export function Stage() {
  const desktop = useDesktop()
  return desktop ? <StageDesktop /> : null
}

function useDesktop() {
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setD(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return d
}

function StageDesktop() {
  const active = useActiveSection()
  const [state, dispatch] = useReducer(reduce, REST_ID, initial)
  const timer = useRef<number | null>(null)

  useEffect(() => { dispatch({ type: 'focus', section: active }) }, [active])

  useEffect(() => {
    if (state.phase !== 'resting') return
    timer.current = window.setTimeout(() => dispatch({ type: 'rested' }), REST_MS)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [state.phase, state.pending])

  const scene = state.phase === 'showing' && state.scene ? sceneFor(state.scene) : null

  return (
    <div className="stage fixed inset-0 z-0 overflow-hidden" aria-hidden="true" data-scene-active={scene?.section ?? 'hero'}>
      <Layer scene={sceneFor(REST_ID)} visible={!scene} rest />
      {scene && <Layer key={scene.section} scene={scene} visible />}
      <div className="portrait-scan" />
      <div className="portrait-vignette" />
    </div>
  )
}

function useMediaFlags() {
  const [f, setF] = useState({ video: false, fine: false })
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    setF({ video: !reduce && !saveData, fine: window.matchMedia('(pointer: fine)').matches && !reduce })
  }, [])
  return f
}

function Layer({ scene, visible, rest = false }: { scene: Scene; visible: boolean; rest?: boolean }) {
  const { video: wantVideo } = useMediaFlags()
  const [ready, setReady] = useState(false)
  const [vid, setVid] = useState(false)
  const poster = posterSrcSet(scene)
  const v = videoSrc(scene)
  const ref = useRef<HTMLVideoElement>(null)

  // pause hidden layers: one decoding video at a time
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (visible) el.play().catch(() => {})
    else el.pause()
  }, [visible, vid])

  return (
    <div
      className="stage-layer absolute inset-0"
      data-visible={visible}
      data-ready={ready}
      data-video={vid}
      style={{ ['--pos' as string]: scene.position, transitionDuration: `${SCENE_FADE_MS}ms` }}
    >
      <img
        src={poster.src}
        srcSet={poster.srcSet}
        sizes="100vw"
        alt=""
        decoding="async"
        loading={rest ? 'eager' : 'lazy'}
        fetchPriority={rest ? 'high' : 'auto'}
        onLoad={() => setReady(true)}
        className="stage-img"
      />
      {wantVideo && scene.video !== false && (
        <video
          ref={ref}
          className="stage-video"
          autoPlay={visible}
          muted
          loop
          playsInline
          preload={rest ? 'auto' : 'metadata'}
          disablePictureInPicture
          onCanPlay={() => setVid(true)}
          onError={() => setVid(false)}
        >
          <source src={v.webm} type="video/webm" />
          <source src={v.mp4} type="video/mp4" />
        </video>
      )}
      {scene.glow && (
        <div className="portrait-glow" style={{ left: scene.glow.left, top: scene.glow.top, width: scene.glow.width }} />
      )}
    </div>
  )
}
