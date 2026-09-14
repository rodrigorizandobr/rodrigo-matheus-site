import { describe, it, expect } from 'vitest'
import { routeFor } from './router'

describe('routeFor — o mínimo de roteamento que o site precisa', () => {
  it.each([
    ['/', '', { page: 'home', slug: null }],
    ['/index.html', '', { page: 'home', slug: null }],
    ['/blog', '', { page: 'blog', slug: null }],
    ['/blog/', '', { page: 'blog', slug: null }],
    ['/blog/', '#why-i-moved-to-cloud-run', { page: 'blog', slug: 'why-i-moved-to-cloud-run' }],
    ['/blog/why-i-moved-to-cloud-run', '', { page: 'blog', slug: 'why-i-moved-to-cloud-run' }],
    ['/blog/why-i-moved-to-cloud-run/', '', { page: 'blog', slug: 'why-i-moved-to-cloud-run' }],
    ['/qualquer-coisa', '', { page: 'home', slug: null }],
  ])('%s%s', (path, hash, expected) => {
    expect(routeFor(path, hash)).toEqual(expected)
  })
  it('ignora hashes de seção na home', () => {
    expect(routeFor('/', '#about')).toEqual({ page: 'home', slug: null })
  })
})
