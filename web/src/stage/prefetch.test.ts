import { describe, it, expect } from 'vitest'
import { prefetchQueue } from './prefetch'

describe('prefetchQueue — aquece o cache na ordem de leitura', () => {
  it('primeira seção primeiro; por cena: ida, loop, volta; encodes mobile no mobile', () => {
    const q = prefetchQueue(true, true)
    expect(q.slice(0, 3)).toEqual(['/scenes/eyes-in.m.webm', '/scenes/eyes.m.webm', '/scenes/eyes-out.m.webm'])
    expect(q).toHaveLength(6 * 3)
    expect(q.every((u) => u.includes('.m.'))).toBe(true)
  })
  it('sem suporte a webm (Safari) usa mp4', () => {
    expect(prefetchQueue(false, false)[0]).toBe('/scenes/eyes-in.mp4')
  })
})
