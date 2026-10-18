import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LONG_BASE } from './api'

const hosting = JSON.parse(readFileSync('../firebase.json', 'utf8')).hosting
const csp: string = hosting.headers
  .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
  .find((h: { key: string }) => h.key === 'Content-Security-Policy').value
const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name)) ?? ''
const mediaSrc = directive('media-src')
const connectSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src')) ?? ''

describe('CSP do Hosting deixa o painel falar com o Cloud Run', () => {
  it('connect-src inclui a origem das operações longas (senão o fetch morre como "Failed to fetch")', () => {
    expect(connectSrc.split(/\s+/)).toContain(new URL(LONG_BASE).origin)
  })

  it('media-src inclui o Cloud Run: o vídeo do recorte vem de lá, porque o CDN do Hosting devolve 200 e o Safari do iPhone exige 206', () => {
    expect(mediaSrc.split(/\s+/)).toContain(new URL(LONG_BASE).origin)
  })
})
