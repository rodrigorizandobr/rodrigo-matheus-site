import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Regressão de cascata (o bug que escondeu TODAS as transições por dias): o clipe de transição
 * tocava, a camada estava visível — e o `<video>` dentro dela saía com `opacity: 0`, porque
 * `.stage-video { opacity: 0 }` vem depois de `.stage-trans-video { opacity: 1 }` com a MESMA
 * especificidade. Resultado na tela: cena antiga parada e corte seco. Ver CLAUDE.md.
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const at = (sel: string) => css.indexOf(sel)

describe('tokens.css — o vídeo da transição precisa vencer o opacity:0 do .stage-video', () => {
  it('existe uma regra mais específica (.stage-trans .stage-video) para o clipe', () => {
    expect(css).toContain('.stage-trans .stage-video')
  })
  it('essa regra vem depois do `.stage-video { opacity: 0 }` OU é mais específica que ele', () => {
    const zero = at('.stage-video { opacity: 0')
    const win = at('.stage-trans .stage-video')
    expect(zero).toBeGreaterThan(-1)
    expect(win).toBeGreaterThan(-1)
    // duas classes vencem uma classe independentemente da ordem, mas garantimos as duas coisas
    expect(win).toBeGreaterThan(zero)
  })
  it('o clipe não pode herdar o fade de 1.2s do loop — ele já tem o fade da própria camada', () => {
    const block = css.slice(at('.stage-trans .stage-video'), at('.stage-trans .stage-video') + 160)
    expect(block).toMatch(/opacity:\s*1/)
    expect(block).toMatch(/transition:\s*none/)
  })
})
