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

export type VideoSources = { mp4: string; webm?: string }

/**
 * Desktop gets webm (VP9) + mp4; `mobile` gets ONLY the 854px H.264 mp4 (scripts/pack-mobile.mjs).
 * Every phone decodes H.264 in hardware; VP9 often lands in software and stutters, and Chrome/Safari
 * would pick the webm <source> first just because they *can* play it.
 */
export const videoSrc = (s: Scene, mobile = false): VideoSources => {
  const base = s.part === 'rest' ? '/hero/idle' : `/scenes/${s.part}`
  return mobile ? { mp4: `${base}.m.mp4` } : { webm: `${base}.webm`, mp4: `${base}.mp4` }
}

/**
 * Transition clip for a scene: 'in' = camera travels from the resting bust to the part (its last
 * frame is the close-up still, i.e. the loop's first frame); 'out' = the same clip reversed.
 */
export const transitionSrc = (s: Scene, dir: 'in' | 'out', mobile = false): VideoSources => {
  const base = `/scenes/${s.part}-${dir}`
  return mobile ? { mp4: `${base}.m.mp4` } : { webm: `${base}.webm`, mp4: `${base}.mp4` }
}

/** Neighbours in reading order (both non-rest): there is a clip going straight between them. */
export const isNeighbour = (a: string, b: string): boolean => {
  const ia = SCENES.findIndex((s) => s.section === a)
  const ib = SCENES.findIndex((s) => s.section === b)
  return ia > 0 && ib > 0 && Math.abs(ia - ib) === 1
}

/**
 * Próxima parte no caminho de `from` até `to` — UM passo, não o destino.
 *
 * Só existem clipes entre partes vizinhas, então ir do fim da página ao começo é
 * andar de volta por cada uma: mãos → punho → cérebro → coração → pescoço → olhos.
 * A máquina chama isto a cada pouso e emenda o próximo trecho, o que faz a volta
 * parecer a mesma câmera refazendo o caminho — e não um corte para o busto.
 *
 * `null` quando não há passo: voltar ao topo (hero) ou sair dele usa os clipes
 * busto → parte e parte → busto.
 */
export const stepToward = (from: string, to: string): string | null => {
  const ia = SCENES.findIndex((s) => s.section === from)
  const ib = SCENES.findIndex((s) => s.section === to)
  if (ia <= 0 || ib <= 0 || ia === ib) return null
  return SCENES[ia + (ib > ia ? 1 : -1)].section
}

/**
 * Part → part clip (scripts/pack-links.mjs): first frame = `from`'s still (its loop's frame 0),
 * last frame = `to`'s still. Both directions exist as files; the reverse one is the same take reversed.
 */
export const linkSrc = (from: Scene, to: Scene, mobile = false): VideoSources => {
  const base = `/scenes/${from.part}-${to.part}`
  return mobile ? { mp4: `${base}.m.mp4` } : { webm: `${base}.webm`, mp4: `${base}.mp4` }
}
