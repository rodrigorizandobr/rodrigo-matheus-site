import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A prévia era um overlay `position: fixed` DENTRO do `<main>` (`z-10`): o contexto de empilhamento
 * do main prendia o z-index 70 do overlay, o conteúdo ficava com altura zero e o rodapé do site
 * subia para logo abaixo do header, pintando por cima do topo da capa. Hoje a prévia é uma página
 * em fluxo, com a barra de controles `sticky` colada no header.
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const rule = (sel: string) => {
  const start = css.indexOf(`${sel} {`)
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start))
}

describe('tokens.css — prévia do post', () => {
  it('a barra de controles gruda logo abaixo do header, sem vão', () => {
    const bar = rule('.preview-page > .preview-bar')
    expect(bar).toMatch(/position:\s*sticky/)
    expect(bar).toMatch(/top:\s*var\(--header-h\)/)
  })

  it('a barra base dos modais NÃO é sticky (o `top` a empurraria para baixo)', () => {
    expect(rule('.preview-bar')).not.toMatch(/sticky/)
  })

  it('a barra sticky não quebra os modais que ainda usam o overlay fixo', () => {
    expect(rule('.preview-overlay')).toMatch(/position:\s*fixed/)
    expect(css).toContain('.preview-body {')
  })
})
