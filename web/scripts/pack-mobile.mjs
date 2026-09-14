#!/usr/bin/env node
/**
 * Mobile-sized loops (854px wide, higher CRF) next to the desktop ones:
 *   public/hero/idle.m.{mp4,webm}   public/scenes/<part>.m.{mp4,webm}
 * Same palindrome trick as the desktop encodes. Phones pick these via videoSrc(scene, mobile).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const jobs = [['.gen/idle-a.mp4', 'public/hero/idle.m'], ...['eyes', 'neck', 'core', 'brain', 'hand'].map((p) => [`.gen/v-${p}.mp4`, `public/scenes/${p}.m`])]
const pal = '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,setpts=N/FRAME_RATE/TB,scale=854:-2[v]'
const ff = (src, args) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', pal, '-map', '[v]', '-an', ...args], { stdio: 'inherit' })

for (const [src, out] of jobs) {
  if (!existsSync(src)) { console.log('skip', src); continue }
  ff(src, ['-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}.mp4`])
  ff(src, ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', `${out}.webm`])
  console.log(out.padEnd(24), ['mp4', 'webm'].map((e) => `${e} ${(statSync(`${out}.${e}`).size / 1024).toFixed(0)}K`).join('  '))
}
