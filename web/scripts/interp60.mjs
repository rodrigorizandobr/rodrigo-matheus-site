#!/usr/bin/env node
/**
 * Veo takes are 24 fps. On a 60/120 Hz screen that is 3:2 pulldown — the loops never look "fluid"
 * however well they decode. This step motion-interpolates each take once to 60 fps (ffmpeg
 * minterpolate, mci) into a near-lossless intermediate the pack-* scripts then encode from:
 *
 *   .gen/idle-a.mp4, .gen/v-<part>.mp4  →  .gen/i60-idle.mp4, .gen/i60-<part>.mp4   (1280px, 60 fps)
 *
 * Slow (~6 min per 8 s take per core); all takes run in parallel. Idempotent: skips existing outputs.
 *   node scripts/interp60.mjs [idle eyes core ...]
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const ALL = ['idle', 'eyes', 'neck', 'core', 'brain', 'fist', 'hand']
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL
const srcOf = (n) => (n === 'idle' ? '.gen/idle-a.mp4' : `.gen/v-${n}.mp4`)
const VF = 'scale=1280:-2,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'

const run = (n) => new Promise((res, rej) => {
  const out = `.gen/i60-${n}.mp4`
  if (!existsSync(srcOf(n))) { console.log('skip', n, '(no source)'); return res() }
  if (existsSync(out)) { console.log('keep', out); return res() }
  const t0 = Date.now()
  const p = spawn('ffmpeg', ['-v', 'error', '-y', '-i', srcOf(n), '-vf', VF, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' })
  p.on('exit', (c) => { console.log(n.padEnd(6), c === 0 ? `ok ${((Date.now() - t0) / 60000).toFixed(1)} min` : `FAILED (${c})`); c === 0 ? res() : rej(new Error(n)) })
})
await Promise.all(names.map(run))
