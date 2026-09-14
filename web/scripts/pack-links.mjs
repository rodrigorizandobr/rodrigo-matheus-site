#!/usr/bin/env node
/**
 * .gen/l-<a>-<b>.mp4 (part a → part b, Veo first+last frame = the two stills) →
 *   public/scenes/<a>-<b>.{mp4,webm}  forward, 1280px     public/scenes/<a>-<b>.m.mp4  854px H.264
 *   public/scenes/<b>-<a>.{mp4,webm}  reversed            public/scenes/<b>-<a>.m.mp4
 * Same re-timing as pack-transitions (SPEED 2.5 → exactly 60 fps). Keep TRANSITION_MS in Stage.tsx = 8 s / SPEED.
 *
 *   node scripts/pack-links.mjs [eyes-neck neck-core ...]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const ALL = ['eyes-neck', 'neck-core', 'core-brain', 'brain-fist', 'fist-hand']
const pairs = process.argv.slice(2).length ? process.argv.slice(2) : ALL
const SPEED = 2.5
const retime = `setpts=PTS-STARTPTS,setpts=PTS/${SPEED},fps=60`
const enc = {
  mp4: (crf) => ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  webm: (crf) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2'],
}
const ff = (src, vf, args, out) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', vf, '-an', ...args, out], { stdio: 'inherit' })
const kb = (f) => (statSync(f).size / 1024).toFixed(0) + 'K'

for (const pair of pairs) {
  const [a, b] = pair.split('-')
  const src = `.gen/l-${pair}.mp4`
  if (!existsSync(src)) { console.log('skip', pair, '(no', src + ')'); continue }
  for (const [tag, w, crf4, crf9] of [['', 1280, 24, 33], ['.m', 854, 26, null]]) {
    ff(src, `${retime},scale=${w}:-2`, enc.mp4(crf4), `public/scenes/${a}-${b}${tag}.mp4`)
    ff(src, `reverse,${retime},scale=${w}:-2`, enc.mp4(crf4), `public/scenes/${b}-${a}${tag}.mp4`)
    if (crf9 === null) continue
    ff(src, `${retime},scale=${w}:-2`, enc.webm(crf9), `public/scenes/${a}-${b}${tag}.webm`)
    ff(src, `reverse,${retime},scale=${w}:-2`, enc.webm(crf9), `public/scenes/${b}-${a}${tag}.webm`)
  }
  console.log(pair.padEnd(11), `→ ${kb(`public/scenes/${a}-${b}.webm`)}  ← ${kb(`public/scenes/${b}-${a}.webm`)}  mobile → ${kb(`public/scenes/${a}-${b}.m.mp4`)}`)
}
