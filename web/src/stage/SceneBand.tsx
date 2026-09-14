import { sceneFor, posterSrcSet } from './scenes'

/** Mobile counterpart of the Stage: a 16:9 strip of the section's body part, in normal flow. */
export function SceneBand({ section }: { section: string }) {
  const scene = sceneFor(section)
  const poster = posterSrcSet(scene)
  return (
    <div className="scene-band lg:hidden relative aspect-[16/9] w-full overflow-hidden mb-6 border border-line/70" aria-hidden="true" data-testid="scene-band" data-part={scene.part}>
      <img src={poster.src} srcSet={poster.srcSet} sizes="100vw" alt="" loading="lazy" decoding="async"
           className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: scene.position }} />
      {scene.glow && <div className="portrait-glow" style={{ left: scene.glow.left, top: scene.glow.top, width: scene.glow.width }} />}
      <div className="portrait-scan" />
    </div>
  )
}
