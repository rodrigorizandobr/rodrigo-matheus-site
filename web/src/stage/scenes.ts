/**
 * One scene per section: which part of the android is under examination while that section is on
 * screen. Assets are produced by scripts/pack-scenes.mjs from .gen/sc-<part>.png and .gen/v-<part>.mp4.
 * `hero` is the resting bust and reuses the hero assets.
 */
export type Scene = {
  section: string
  part: string
  /** where the subject sits, so object-fit: cover keeps it when the viewport ratio differs */
  position: string
  glow: { left: string; top: string; width: string } | null
  /** false = poster only. The mouth loop kept baring teeth across two Veo takes; a still is calmer. */
  video?: boolean
}

export const SCENES: Scene[] = [
  { section: 'hero',       part: 'rest',  position: '50% 26%', glow: { left: '50%', top: '30%', width: '22%' } },
  { section: 'about',      part: 'eyes',  position: '50% 30%', glow: { left: '50%', top: '38%', width: '60%' } },
  { section: 'experience', part: 'neck',  position: '50% 40%', glow: null },
  { section: 'projects',   part: 'core',  position: '50% 45%', glow: { left: '50%', top: '48%', width: '26%' } },
  { section: 'education',  part: 'brain', position: '50% 22%', glow: { left: '50%', top: '30%', width: '30%' } },
  { section: 'blog',       part: 'mouth', position: '50% 55%', glow: null, video: false },
  { section: 'contact',    part: 'hand',  position: '50% 60%', glow: null },
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
