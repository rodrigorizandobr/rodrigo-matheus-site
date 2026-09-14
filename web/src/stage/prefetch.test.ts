import { describe, it, expect } from 'vitest'
import { prefetchQueue } from './prefetch'

describe('prefetchQueue — aquece o cache na ordem de leitura', () => {
  it('primeira seção primeiro; por cena: ida, loop, volta; no mobile sempre mp4 mesmo com webm suportado', () => {
    const q = prefetchQueue(true, true)
    expect(q.slice(0, 3)).toEqual(['/scenes/eyes-in.m.mp4', '/scenes/eyes.m.mp4', '/scenes/eyes-out.m.mp4'])
    expect(q).toHaveLength(6 * 3)
    expect(q.every((u) => u.endsWith('.m.mp4'))).toBe(true)
  })
  it('desktop com webm usa webm', () => {
    expect(prefetchQueue(false, true)[0]).toBe('/scenes/eyes-in.webm')
  })
  it('sem suporte a webm (Safari) usa mp4', () => {
    expect(prefetchQueue(false, false)[0]).toBe('/scenes/eyes-in.mp4')
  })
})
