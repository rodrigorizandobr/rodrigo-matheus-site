#!/usr/bin/env node
/**
 * Veo clip → seamless hero loop. The clip is played forward then reversed (palindrome), so the
 * loop point is invisible no matter how the last frame differs from the first. Audio stripped.
 *
 *   node scripts/pack-video.mjs [.gen/idle-a.mp4]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

// prefer the 60 fps interpolated intermediate (scripts/interp60.mjs) over the raw 24 fps take
const src = process.argv[2] ?? (existsSync('.gen/i60-idle.mp4') ? '.gen/i60-idle.mp4' : '.gen/idle-a.mp4')
// scale lives inside the complex graph: ffmpeg refuses -vf on a stream fed from filter_complex
const pal = '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,setpts=N/FRAME_RATE/TB,scale=1280:-2[v]'
const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', pal, '-map', '[v]', '-an', ...args], { stdio: 'inherit' })

// H.264 for Safari and as universal fallback
run(['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'public/hero/idle.mp4'])
// VP9 for Chrome/Firefox — smaller
run(['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', 'public/hero/idle.webm'])

for (const f of ['public/hero/idle.mp4', 'public/hero/idle.webm']) console.log(f.padEnd(24), (statSync(f).size / 1024 / 1024).toFixed(2), 'MB')
