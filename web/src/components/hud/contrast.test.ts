import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The light palette turned --white-armor into a surface colour. Using it as text is
 * white-on-white — this test is the tripwire so a theme flip can't silently hide copy again.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8') // vitest root is web/
const css = read('src/styles/tokens.css')
const hex = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1] ?? ''

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('tokens de cor — contraste WCAG AA sobre --surface', () => {
  const surface = hex('surface')

  it.each([['text', 4.5], ['heading', 4.5], ['muted', 4.5], ['red', 3], ['cyan', 3]])(
    '--%s atinge %s:1',
    (token, min) => {
      const r = ratio(hex(token as string), surface)
      expect(r, `--${token} = ${hex(token as string)} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min as number)
    },
  )

  it('nenhum componente usa --white-armor como cor de texto', () => {
    const files = ['StatPanel', 'ActionBar']
      .map((f) => read(`src/components/hud/${f}.tsx`))
      .join('\n')
    expect(files).not.toMatch(/text-armor/)
  })
})
