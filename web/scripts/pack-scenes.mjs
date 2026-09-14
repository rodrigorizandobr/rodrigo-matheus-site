#!/usr/bin/env node
/**
 * .gen/sc-<part>.png → public/scenes/<part>-{1920,1280}.webp (posters, LCP/fallback)
 * .gen/v-<part>.mp4  → public/scenes/<part>.{mp4,webm} (forward+reverse palindrome loops, muted)
 *
 *   node scripts/pack-scenes.mjs            # all parts
 *   node scripts/pack-scenes.mjs eyes core  # some
 */
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'

const ALL = ['eyes', 'neck', 'core', 'brain', 'fist', 'hand']
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ALL
mkdirSync('public/scenes', { recursive: true })

const pal = '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,setpts=N/FRAME_RATE/TB,scale=1280:-2[v]'
const ff = (src, args) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', pal, '-map', '[v]', '-an', ...args], { stdio: 'inherit' })

for (const p of parts) {
  const still = `.gen/sc-${p}.png`
  if (existsSync(still)) {
    for (const w of [1920, 1280]) await sharp(still).resize({ width: w }).webp({ quality: 80 }).toFile(`public/scenes/${p}-${w}.webp`)
  }
  const clip = `.gen/v-${p}.mp4`
  if (existsSync(clip)) {
    ff(clip, ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `public/scenes/${p}.mp4`])
    ff(clip, ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', `public/scenes/${p}.webm`])
  }
  const sizes = ['-1920.webp', '-1280.webp', '.mp4', '.webm'].map((e) => `public/scenes/${p}${e}`).filter(existsSync).map((f) => `${f.split('/').pop()} ${(statSync(f).size / 1024).toFixed(0)}K`)
  console.log(p.padEnd(6), sizes.join('  '))
}
