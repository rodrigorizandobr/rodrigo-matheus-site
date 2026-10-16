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

const recorte = {
  status: 'ready' as const, hash: 'c'.repeat(64), sourceUrl: 'https://www.youtube.com/watch?v=qt5p-_tE8d0',
  title: 'Roadster Event', channel: 'Tesla', start: 1340, end: 1368, width: 1280, height: 720,
}

describe('PostArticle — recorte de vídeo', () => {
  it('recorte pronto vira o destaque do post, com a capa como quadro inicial', () => {
    const { container } = render(<PostArticle post={{ ...post(capa), clip: recorte }} lang="pt" minutes={1} />)
    const video = container.querySelector('video')!
    expect(video.getAttribute('src')).toBe(`/api/blog/video/${'c'.repeat(64)}.mp4`)
    expect(video.getAttribute('poster')).toBe(`/api/blog/image/${'a'.repeat(64)}.jpg`)
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('playsinline')
    expect(container.querySelector('img')).toBeNull()
  })

  it('credita o canal e leva ao YouTube no segundo exato do trecho', () => {
    render(<PostArticle post={{ ...post(capa), clip: recorte }} lang="pt" minutes={1} />)
    const link = screen.getByRole('link', { name: /Roadster Event/ })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=qt5p-_tE8d0&t=1340s')
    expect(screen.getByText(/Tesla/)).toBeInTheDocument()
  })

  it('recorte pendente ou que falhou não aparece: fica a capa', () => {
    for (const clip of [{ status: 'pending' as const }, { status: 'failed' as const, reason: 'x' }]) {
      const { container, unmount } = render(<PostArticle post={{ ...post(capa), clip }} lang="pt" minutes={1} />)
      expect(container.querySelector('video')).toBeNull()
      expect(container.querySelector('img')).not.toBeNull()
      unmount()
    }
  })

  it('no site público o recorte chega sem status — e aparece mesmo assim', () => {
    const { status: _, ...publico } = recorte
    const { container } = render(<PostArticle post={{ ...post(capa), clip: publico }} lang="pt" minutes={1} />)
    expect(container.querySelector('video')).not.toBeNull()
  })
})
