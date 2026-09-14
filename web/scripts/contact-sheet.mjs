#!/usr/bin/env node
/**
 * Contact sheet for reviewing a generated take BEFORE packing it (each Veo take costs money;
 * a rejected one costs the same as a good one, so always look at the middle, not just the ends).
 *
 *   node scripts/contact-sheet.mjs <out.jpg> <clip.mp4> [clip2.mp4 ...]
 *
 * One row per clip, 6 evenly spaced frames. A real camera travel shows a different framing in
 * every cell; a "dissolve" take shows the first and last image with nothing in between.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import sharp from 'sharp'

const [out, ...clips] = process.argv.slice(2)
if (!out || !clips.length) throw new Error('usage: contact-sheet.mjs <out.jpg> <clip.mp4> ...')
const COLS = 6, W = 320, H = 180
const tmp = mkdtempSync(join(tmpdir(), 'sheet-'))
const rows = []

for (const clip of clips) {
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip], { encoding: 'utf8' }).trim())
  const cells = []
  for (let i = 0; i < COLS; i++) {
    const t = (dur * (i + 0.5)) / COLS
    const f = join(tmp, `${basename(clip, '.mp4')}-${i}.png`)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', clip, '-frames:v', '1', '-vf', `scale=${W}:${H}`, f])
    cells.push({ input: f, left: i * W, top: 0 })
  }
  const label = Buffer.from(`<svg width="${W * COLS}" height="24"><rect width="${W * COLS}" height="24" fill="#111"/><text x="8" y="17" font-family="Helvetica" font-size="14" fill="#fff">${basename(clip)}  (${dur.toFixed(1)}s)</text></svg>`)
  const strip = join(tmp, `row-${basename(clip, '.mp4')}.png`)
  await sharp({ create: { width: W * COLS, height: H + 24, channels: 3, background: '#111' } })
    .composite([...cells.map((c) => ({ ...c, top: 24 })), { input: label, left: 0, top: 0 }])
    .png().toFile(strip)
  rows.push(strip)
}

await sharp({ create: { width: W * COLS, height: (H + 24) * rows.length, channels: 3, background: '#111' } })
  .composite(rows.map((input, i) => ({ input, left: 0, top: i * (H + 24) })))
  .jpeg({ quality: 82 }).toFile(out)
rmSync(tmp, { recursive: true, force: true })
console.log(out, `${rows.length} clipes × ${COLS} quadros`)
