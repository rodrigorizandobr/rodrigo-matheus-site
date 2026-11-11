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
    ['/admin', '', { page: 'admin', slug: null }],
    ['/admin/', '', { page: 'admin', slug: null }],
    ['/admin/posts/abc', '', { page: 'admin', slug: null }],
    ['/vivendo-de-imoveis', '', { page: 'planner', slug: null }],
    ['/vivendo-de-imoveis/', '', { page: 'planner', slug: null }],
    ['/previdencia-privada', '', { page: 'pension', slug: null }],
    ['/previdencia-privada/', '', { page: 'pension', slug: null }],
    ['/qualquer-coisa', '', { page: 'home', slug: null }],
  ])('%s%s', (path, hash, expected) => {
    expect(routeFor(path, hash)).toEqual(expected)
  })
  it('ignora hashes de seção na home', () => {
    expect(routeFor('/', '#about')).toEqual({ page: 'home', slug: null })
  })
  it('/administrativo não é /admin — só o caminho exato abre o painel', () => {
    expect(routeFor('/administrativo', '')).toEqual({ page: 'home', slug: null })
  })
  it('/vivendo-de-imoveis-x não é /vivendo-de-imoveis — só o caminho exato abre o simulador', () => {
    expect(routeFor('/vivendo-de-imoveis-x', '')).toEqual({ page: 'home', slug: null })
  })
  it('/previdencia-privada-x não é /previdencia-privada — só o caminho exato abre o simulador', () => {
    expect(routeFor('/previdencia-privada-x', '')).toEqual({ page: 'home', slug: null })
  })
})
