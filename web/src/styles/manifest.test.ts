import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'))
const tokens = readFileSync('src/styles/tokens.css', 'utf8')
const token = (nome: string) => tokens.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{3,8})`, 'i'))?.[1]

describe('site.webmanifest acompanha a paleta', () => {
  it('a cor de tema é a do site, não a escura da versão antiga', () => {
    expect(manifest.theme_color).toBe(token('bg'))
    expect(manifest.background_color).toBe(token('bg'))
  })

  it('declara os dois ícones que o Android instala', () => {
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512'])
  })
})
