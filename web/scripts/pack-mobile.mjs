#!/usr/bin/env node
/**
 * Mobile-sized loops (854px wide, higher CRF) next to the desktop ones — H.264 ONLY:
 *   public/hero/idle.m.mp4   public/scenes/<part>.m.mp4
 * Same palindrome trick as the desktop encodes. Phones pick these via videoSrc(scene, mobile).
 * No webm for phones: H.264 is hardware-decoded everywhere, VP9 often is not (software → stutter).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

// prefer the 60 fps interpolated intermediates (scripts/interp60.mjs) over the raw 24 fps takes
const take = (i60, raw) => (existsSync(i60) ? i60 : raw)
const jobs = [[take('.gen/i60-idle.mp4', '.gen/idle-a.mp4'), 'public/hero/idle.m'], ...['eyes', 'neck', 'core', 'brain', 'hand', 'fist'].map((p) => [take(`.gen/i60-${p}.mp4`, `.gen/v-${p}.mp4`), `public/scenes/${p}.m`])]
const pal = '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,setpts=N/FRAME_RATE/TB,scale=854:-2[v]'
const ff = (src, args) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', pal, '-map', '[v]', '-an', ...args], { stdio: 'inherit' })

for (const [src, out] of jobs) {
  if (!existsSync(src)) { console.log('skip', src); continue }
  ff(src, ['-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}.mp4`])
  console.log(out.padEnd(24), `mp4 ${(statSync(`${out}.mp4`).size / 1024).toFixed(0)}K`)
}
