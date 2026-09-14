#!/usr/bin/env node
/**
 * Image-to-video with Veo. Keeps the exact character from a source still.
 * Key comes from web/.env.local (gitignored).
 *
 *   node scripts/gen-video.mjs <out.mp4> "<prompt>" --in still.png [--ar 16:9] [--seconds 8]
 *        [--model veo-3.1-generate-preview] [--res 720p] [--neg "text, watermark"]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, extname } from 'node:path'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
)
const KEY = env.GEMINI_API_KEY
if (!KEY) throw new Error('GEMINI_API_KEY missing from web/.env.local')

const [out, prompt, ...rest] = process.argv.slice(2)
if (!out || !prompt) throw new Error('usage: gen-video.mjs <out.mp4> "<prompt>" --in still.png')
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d }
const model = flag('model', 'veo-3.1-generate-preview')
const aspectRatio = flag('ar', '16:9')
const durationSeconds = Number(flag('seconds', '8'))
const resolution = flag('res', '720p')
const negativePrompt = flag('neg', 'text, watermark, subtitles, camera movement, zoom, cuts, morphing, extra limbs, color shift, dark lighting')
const inFile = flag('in', null)

const H = { 'x-goog-api-key': KEY, 'content-type': 'application/json' }
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

const instance = { prompt }
if (inFile) {
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(inFile).toLowerCase()]
  instance.image = { bytesBase64Encoded: readFileSync(inFile).toString('base64'), mimeType: mime }
}

const t0 = Date.now()
const start = await fetch(`${BASE}/models/${model}:predictLongRunning`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ instances: [instance], parameters: { aspectRatio, durationSeconds, resolution, negativePrompt, personGeneration: 'allow_adult' } }),
})
if (!start.ok) throw new Error(`start ${start.status}: ${(await start.text()).slice(0, 500)}`)
const { name } = await start.json()
console.log(`operation ${name}`)

let op
for (;;) {
  await new Promise((r) => setTimeout(r, 10_000))
  const r = await fetch(`${BASE}/${name}`, { headers: H })
  if (!r.ok) throw new Error(`poll ${r.status}: ${(await r.text()).slice(0, 300)}`)
  op = await r.json()
  process.stdout.write(`\r  … ${Math.round((Date.now() - t0) / 1000)}s`)
  if (op.done) break
}
console.log()
if (op.error) throw new Error(`veo error: ${JSON.stringify(op.error).slice(0, 500)}`)

const sample = op.response?.generateVideoResponse?.generatedSamples?.[0] ?? op.response?.generatedVideos?.[0]
const uri = sample?.video?.uri
if (!uri) throw new Error(`no video uri in response: ${JSON.stringify(op.response).slice(0, 600)}`)

const dl = await fetch(uri.includes('alt=media') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}alt=media`, { headers: { 'x-goog-api-key': KEY } })
if (!dl.ok) throw new Error(`download ${dl.status}`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(await dl.arrayBuffer()))
console.log(`${out}  ${(readFileSync(out).length / 1024 / 1024).toFixed(1)} MB  (${model}, ${aspectRatio}, ${durationSeconds}s, ${resolution})`)
