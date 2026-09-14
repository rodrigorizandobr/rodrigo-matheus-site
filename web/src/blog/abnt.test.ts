import { describe, it, expect } from 'vitest'
import { abntReference, referencesOf } from './abnt'
import type { Post } from './types'

const ref = (over = {}) => ({
  url: 'https://exame.com/inteligencia-artificial/o-futuro',
  title: 'O futuro da inteligência artificial',
  site: 'exame.com',
  accessedAt: '2026-09-14T21:00:00Z',
  ...over,
})

describe('abntReference — NBR 6023 para documento on-line', () => {
  it('site como autor em caixa alta, título, disponível em e acesso em', () => {
    expect(abntReference(ref(), 'pt')).toBe(
      'EXAME.COM. O futuro da inteligência artificial. Disponível em: https://exame.com/inteligencia-artificial/o-futuro. Acesso em: 14 set. 2026.',
    )
  })

  it('maio não é abreviado, os outros meses sim', () => {
    expect(abntReference(ref({ accessedAt: '2026-05-03T12:00:00Z' }), 'pt')).toContain('Acesso em: 3 maio 2026.')
    expect(abntReference(ref({ accessedAt: '2026-01-31T12:00:00Z' }), 'pt')).toContain('Acesso em: 31 jan. 2026.')
    expect(abntReference(ref({ accessedAt: '2026-12-01T12:00:00Z' }), 'pt')).toContain('Acesso em: 1 dez. 2026.')
  })

  it('em inglês mantém a estrutura ABNT e traduz só os rótulos', () => {
    expect(abntReference(ref(), 'en')).toBe(
      'EXAME.COM. O futuro da inteligência artificial. Available at: https://exame.com/inteligencia-artificial/o-futuro. Accessed on: 14 Sep. 2026.',
    )
  })

  it('sem título, cita só o site e a URL — sem ponto solto', () => {
    expect(abntReference(ref({ title: '' }), 'pt')).toBe(
      'EXAME.COM. Disponível em: https://exame.com/inteligencia-artificial/o-futuro. Acesso em: 14 set. 2026.',
    )
  })

  it('sem site usa o domínio da própria URL', () => {
    expect(abntReference(ref({ site: '' }), 'pt')).toContain('EXAME.COM.')
  })

  it('sem data de acesso omite o trecho em vez de inventar uma', () => {
    const texto = abntReference(ref({ accessedAt: '' }), 'pt')
    expect(texto).toContain('Disponível em:')
    expect(texto).not.toContain('Acesso em:')
  })

  it('título que já termina em ponto não ganha um segundo', () => {
    expect(abntReference(ref({ title: 'Título com ponto.' }), 'pt')).toContain('Título com ponto. Disponível em:')
  })
})

describe('referencesOf — o post pode ser velho', () => {
  const base = { id: '1', slug: 's', status: 'published', tags: [], image: null, imageAlt: '',
    i18n: {}, createdAt: '', updatedAt: '', scheduledFor: null, publishedAt: null } as unknown as Post

  it('usa as referências completas quando existem', () => {
    const post = { ...base, references: [ref()] } as Post
    expect(referencesOf(post)[0].title).toBe('O futuro da inteligência artificial')
  })

  it('post antigo só com sources ainda rende citação pela URL', () => {
    const post = { ...base, sources: ['https://www1.folha.uol.com.br/x'] } as Post
    const [r] = referencesOf(post)
    expect(r.url).toBe('https://www1.folha.uol.com.br/x')
    expect(r.site).toBe('folha.uol.com.br')
    expect(r.title).toBe('')
  })

  it('post sem nada devolve lista vazia', () => {
    expect(referencesOf(base)).toEqual([])
  })

  it('não repete a mesma URL', () => {
    const post = { ...base, references: [ref(), ref()] } as Post
    expect(referencesOf(post)).toHaveLength(1)
  })
})
