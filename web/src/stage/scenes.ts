/**
 * One scene per section: which part of the android is under examination while that section is on
 * screen, and WHERE on the resting bust the camera zooms to get there. `hero` is the resting pose.
 * Assets: scripts/pack-scenes.mjs (desktop) + scripts/pack-mobile.mjs (854px encodes).
 */
export type Scene = {
  section: string
  part: string
  /** object-position of the close-up itself */
  position: string
  /** zoom on the resting bust that "arrives" at this part: transform-origin + scale */
  zoom: { origin: string; scale: number }
  glow: { left: string; top: string; width: string } | null
  /** false = poster only */
  video?: boolean
  /** true when scripts/pack-transitions.mjs produced <part>-in/-out clips (bust → part, and back) */
  transition?: boolean
}

export const SCENES: Scene[] = [
  { section: 'hero',       part: 'rest',  position: '50% 26%', zoom: { origin: '50% 30%', scale: 1 },    glow: { left: '50%', top: '30%', width: '22%' } },
  { section: 'about',      part: 'eyes',  position: '50% 30%', zoom: { origin: '50% 31%', scale: 2.6 },  glow: { left: '50%', top: '38%', width: '60%' }, transition: true },
  { section: 'experience', part: 'neck',  position: '50% 40%', zoom: { origin: '52% 74%', scale: 2.1 },  glow: null, transition: true },
  { section: 'projects',   part: 'core',  position: '50% 45%', zoom: { origin: '50% 98%', scale: 2.3 },  glow: { left: '50%', top: '48%', width: '26%' }, transition: true },
  { section: 'education',  part: 'brain', position: '50% 22%', zoom: { origin: '50% 4%',  scale: 2.4 },  glow: { left: '50%', top: '30%', width: '30%' }, transition: true },
  { section: 'blog',       part: 'fist',  position: '40% 50%', zoom: { origin: '30% 96%', scale: 2.2 },  glow: null, transition: true },
  { section: 'contact',    part: 'hand',  position: '50% 60%', zoom: { origin: '50% 96%', scale: 2.0 },  glow: null, transition: true },
]

export const sceneFor = (section: string | null): Scene => SCENES.find((s) => s.section === (section ?? 'hero')) ?? SCENES[0]

export const posterSrcSet = (s: Scene) =>
  s.part === 'rest'
    ? { srcSet: '/hero/hero-wide-1280.webp 1280w, /hero/hero-wide-1920.webp 1920w', src: '/hero/hero-wide-1280.webp' }
    : { srcSet: `/scenes/${s.part}-1280.webp 1280w, /scenes/${s.part}-1920.webp 1920w`, src: `/scenes/${s.part}-1280.webp` }

/** `mobile` picks the 854px encodes (scripts/pack-mobile.mjs) — same loops, ~half the bytes. */
export const videoSrc = (s: Scene, mobile = false) => {
  const sfx = mobile ? '.m' : ''
  return s.part === 'rest'
    ? { webm: `/hero/idle${sfx}.webm`, mp4: `/hero/idle${sfx}.mp4` }
    : { webm: `/scenes/${s.part}${sfx}.webm`, mp4: `/scenes/${s.part}${sfx}.mp4` }
}

/**
 * Transition clip for a scene: 'in' = camera travels from the resting bust to the part (its last
 * frame is the close-up still, i.e. the loop's first frame); 'out' = the same clip reversed.
 */
export const transitionSrc = (s: Scene, dir: 'in' | 'out', mobile = false) => {
  const sfx = mobile ? '.m' : ''
  return { webm: `/scenes/${s.part}-${dir}${sfx}.webm`, mp4: `/scenes/${s.part}-${dir}${sfx}.mp4` }
}
