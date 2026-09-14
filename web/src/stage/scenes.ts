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
}

export const SCENES: Scene[] = [
  { section: 'hero',       part: 'rest',  position: '50% 26%', zoom: { origin: '50% 30%', scale: 1 },    glow: { left: '50%', top: '30%', width: '22%' } },
  { section: 'about',      part: 'eyes',  position: '50% 30%', zoom: { origin: '50% 31%', scale: 2.6 },  glow: { left: '50%', top: '38%', width: '60%' } },
  { section: 'experience', part: 'neck',  position: '50% 40%', zoom: { origin: '52% 74%', scale: 2.1 },  glow: null },
  { section: 'projects',   part: 'core',  position: '50% 45%', zoom: { origin: '50% 98%', scale: 2.3 },  glow: { left: '50%', top: '48%', width: '26%' } },
  { section: 'education',  part: 'brain', position: '50% 22%', zoom: { origin: '50% 4%',  scale: 2.4 },  glow: { left: '50%', top: '30%', width: '30%' } },
  // LOGS should be the FIST (scene "fist"). Generation is blocked until the Gemini spend cap is raised;
  // until then it reuses the hand loop so the section still animates. See sprint-3-status.md.
  { section: 'blog',       part: 'hand',  position: '50% 60%', zoom: { origin: '70% 96%', scale: 2.2 },  glow: null },
  { section: 'contact',    part: 'hand',  position: '50% 60%', zoom: { origin: '50% 96%', scale: 2.0 },  glow: null },
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
