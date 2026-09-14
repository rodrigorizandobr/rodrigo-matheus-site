#!/usr/bin/env node
/**
 * Generate hero imagery with Gemini. Key comes from web/.env.local (gitignored) — never a flag.
 *
 *   node scripts/gen-image.mjs <outfile> "<prompt>" [--model M] [--ar 4:5] [--in ref.png]
 *
 * --in passes a source image, so the same character can be re-framed or edited
 * instead of regenerating a different one.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { extname } from 'node:path'
import { dirname } from 'node:path'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
)
const KEY = env.GEMINI_API_KEY
if (!KEY) throw new Error('GEMINI_API_KEY missing from web/.env.local')

const [out, prompt, ...rest] = process.argv.slice(2)
if (!out || !prompt) throw new Error('usage: gen-image.mjs <outfile> "<prompt>" [--model M] [--ar W:H]')
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d }
const model = flag('model', 'gemini-3-pro-image')
const aspectRatio = flag('ar', '4:5')

const inFile = flag('in', null)
const parts0 = [{ text: prompt }]
if (inFile) {
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(inFile).toLowerCase()]
  if (!mime) throw new Error(`unsupported input type: ${inFile}`)
  parts0.unshift({ inlineData: { mimeType: mime, data: readFileSync(inFile).toString('base64') } })
}

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: parts0 }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
  }),
})
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`)

const json = await res.json()
const parts = json.candidates?.[0]?.content?.parts ?? []
const img = parts.find((p) => p.inlineData)?.inlineData
if (!img) throw new Error(`no image returned: ${JSON.stringify(json).slice(0, 400)}`)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(img.data, 'base64'))
console.log(`${out}  ${(Buffer.from(img.data, 'base64').length / 1024).toFixed(0)} KB  (${model}, ${aspectRatio})`)
