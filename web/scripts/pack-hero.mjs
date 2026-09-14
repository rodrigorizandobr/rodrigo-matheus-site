#!/usr/bin/env node
/**
 * Turn a generated source render into the hero's shipped assets.
 * Art direction: the wide clean-room crop fills a desktop viewport, the 4:5 bust
 * is what survives a phone. Same character in both.
 *
 *   node scripts/pack-hero.mjs
 *
 * Sources live in .gen/ (gitignored, regenerate with scripts/gen-image.mjs).
 */
import sharp from 'sharp'

const WIDE = '.gen/wide-a.png'   // 16:9 clean-room framing
const TALL = '.gen/lab-c.png'    // 4:5 bust
const CLASSES = [
  ['.gen/lc-eng.png', 'eng-manager'],
  ['.gen/lc-ai.png', 'ai-strategist'],
  ['.gen/lc-arch.png', 'platform-architect'],
  ['.gen/lc-fin.png', 'fintech'],
]

for (const w of [1920, 1280]) {
  await sharp(WIDE).resize({ width: w }).webp({ quality: 80 }).toFile(`public/hero/hero-wide-${w}.webp`)
}
for (const w of [900, 640]) {
  await sharp(TALL).resize({ width: w }).webp({ quality: 82 }).toFile(`public/hero/hero-tall-${w}.webp`)
}
for (const [src, id] of CLASSES) {
  await sharp(src).resize(160, 160, { fit: 'cover' }).webp({ quality: 82 }).toFile(`public/hero/class-${id}.webp`)
}
await sharp(WIDE).resize({ width: 1200, height: 630, fit: 'cover', position: 'top' })
  .png({ compressionLevel: 9 }).toFile('public/og-image.png')

console.log('hero assets written to public/hero/ and public/og-image.png')
