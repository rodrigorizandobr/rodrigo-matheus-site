import { describe, it, expect } from 'vitest'
import { prefetchQueue } from './prefetch'

describe('prefetchQueue — aquece o cache na ordem de leitura', () => {
  it('primeira seção primeiro; por cena: ida, loop, volta; no mobile sempre mp4 mesmo com webm suportado', () => {
    const q = prefetchQueue(true, true)
    // descendo a página: chegada em cada parte (busto → olhos, depois parte → parte) e o loop dela
    expect(q.slice(0, 4)).toEqual(['/scenes/eyes-in.m.mp4', '/scenes/eyes.m.mp4', '/scenes/eyes-neck.m.mp4', '/scenes/neck.m.mp4'])
    // depois, o caminho de volta (parte → parte invertido) e as saídas pelo busto (saltos do menu)
    expect(q).toContain('/scenes/neck-eyes.m.mp4')
    expect(q).toContain('/scenes/eyes-out.m.mp4')
    expect(q.indexOf('/scenes/hand.m.mp4')).toBeLessThan(q.indexOf('/scenes/neck-eyes.m.mp4'))
    expect(q).toHaveLength(6 /* loops */ + 6 /* chegadas */ + 5 /* voltas diretas */ + 6 /* saídas pelo busto */)
    expect(q.every((u) => u.endsWith('.m.mp4'))).toBe(true)
  })
  it('desktop com webm usa webm', () => {
    expect(prefetchQueue(false, true)[0]).toBe('/scenes/eyes-in.webm')
  })
  it('sem suporte a webm (Safari) usa mp4', () => {
    expect(prefetchQueue(false, false)[0]).toBe('/scenes/eyes-in.mp4')
  })
})
