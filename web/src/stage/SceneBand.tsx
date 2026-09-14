import { useRef, useState } from 'react'
import { sceneFor, posterSrcSet, videoSrc } from './scenes'
import { useInViewPlayback, useMotionAllowed } from './media'

/** Mobile counterpart of the Stage: a 16:9 strip of the section's body part, in normal flow — animated too. */
export function SceneBand({ section }: { section: string }) {
  const scene = sceneFor(section)
  const poster = posterSrcSet(scene)
  const src = videoSrc(scene, true)
  const host = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const motion = useMotionAllowed()
  const wantVideo = motion && scene.video !== false
  useInViewPlayback(host, video, wantVideo)

  return (
    <div ref={host} className="scene-band lg:hidden relative aspect-[16/9] w-full overflow-hidden mb-6 border border-line/70" aria-hidden="true" data-testid="scene-band" data-part={scene.part} data-playing={playing}>
      <img src={poster.src} srcSet={poster.srcSet} sizes="100vw" alt="" loading="lazy" decoding="async"
           className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: scene.position }} />
      {scene.video !== false && (
        <video ref={video} className="band-video" muted loop playsInline preload="none" disablePictureInPicture
               style={{ objectPosition: scene.position }} onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)}>
          <source src={src.webm} type="video/webm" />
          <source src={src.mp4} type="video/mp4" />
        </video>
      )}
      {scene.glow && <div className="portrait-glow" style={{ left: scene.glow.left, top: scene.glow.top, width: scene.glow.width }} />}
      <div className="portrait-scan" />
    </div>
  )
}
