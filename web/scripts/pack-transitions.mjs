#!/usr/bin/env node
/**
 * .gen/t-<part>.mp4 (bust → part, Veo first+last frame) →
 *   public/scenes/<part>-in.{mp4,webm}   forward, 1280px       public/scenes/<part>-in.m.*   854px
 *   public/scenes/<part>-out.{mp4,webm}  reversed               public/scenes/<part>-out.m.*
 * The clip's last frame equals the close-up still, so the loop that follows starts on the same pixels.
 *
 *   node scripts/pack-transitions.mjs [eyes core ...]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const ALL = ['eyes', 'neck', 'core', 'brain', 'fist', 'hand']
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ALL
const enc = {
  mp4: (crf) => ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  webm: (crf) => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2'],
}
const ff = (src, vf, args, out) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', vf, '-an', ...args, out], { stdio: 'inherit' })

for (const p of parts) {
  const src = `.gen/t-${p}.mp4`
  if (!existsSync(src)) { console.log('skip', p, '(no .gen/t-' + p + '.mp4)'); continue }
  for (const [tag, w, crf4, crf9] of [['', 1280, 24, 33], ['.m', 854, 27, 36]]) {
    ff(src, `scale=${w}:-2`, enc.mp4(crf4), `public/scenes/${p}-in${tag}.mp4`)
    ff(src, `scale=${w}:-2`, enc.webm(crf9), `public/scenes/${p}-in${tag}.webm`)
    ff(src, `reverse,scale=${w}:-2`, enc.mp4(crf4), `public/scenes/${p}-out${tag}.mp4`)
    ff(src, `reverse,scale=${w}:-2`, enc.webm(crf9), `public/scenes/${p}-out${tag}.webm`)
  }
  const kb = (f) => (statSync(f).size / 1024).toFixed(0) + 'K'
  console.log(p.padEnd(6), `in ${kb(`public/scenes/${p}-in.webm`)} / out ${kb(`public/scenes/${p}-out.webm`)}  mobile in ${kb(`public/scenes/${p}-in.m.webm`)}`)
}
