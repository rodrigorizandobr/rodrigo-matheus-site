import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostArticle } from './PostArticle'
import type { Post } from './types'

const post = (image: Post['image']): Post => ({
  id: '1', slug: 'p', status: 'published', tags: ['ia'], image, imageAlt: 'capa',
  i18n: { pt: { title: 'T', excerpt: 'E', sections: [{ heading: 'h', paragraphs: ['p'] }] },
          en: { title: 'T', excerpt: 'E', sections: [{ heading: 'h', paragraphs: ['p'] }] } },
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  scheduledFor: null, publishedAt: '2026-09-14T00:00:00Z',
})

const capa = { hash: 'a'.repeat(64), credit: '', sourceUrl: '', alt: 'cabo vermelho', width: 1920, height: 1080 }

describe('PostArticle — a capa é ilustração da casa', () => {
  it('capa sem crédito não deixa legenda vazia embaixo da imagem', () => {
    const { container } = render(<PostArticle post={post(capa)} lang="pt" />)
    expect(container.querySelector('figcaption')).toBeNull()
  })

  it('crédito de banco de imagens continua aparecendo, com link para a fonte', () => {
    render(<PostArticle post={post({ ...capa, credit: 'Foto de Fulano', sourceUrl: 'https://pixabay.com/x' })} lang="pt" />)
    expect(screen.getByRole('link', { name: 'Foto de Fulano' })).toHaveAttribute('href', 'https://pixabay.com/x')
  })

  it('a capa declara tamanho para o navegador não sacudir a página ao carregar', () => {
    const { container } = render(<PostArticle post={post(capa)} lang="pt" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('1920')
    expect(img.getAttribute('height')).toBe('1080')
  })
})
