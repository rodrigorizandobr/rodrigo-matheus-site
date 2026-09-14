import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n/useI18n'
import { BlogPage } from './BlogPage'
import type { Post } from '../blog/types'

const post = (over: Partial<Post> = {}): Post => ({
  id: '1', slug: 'a', status: 'published', tags: ['cloud'],
  image: { hash: 'abc123', provider: 'gemini', credit: 'Gerada com IA (Gemini)', sourceUrl: '', alt: 'capa' },
  imageAlt: 'capa',
  i18n: {
    pt: { title: 'Post A pt', excerpt: 'resumo pt', sections: [{ heading: 'Seção um', paragraphs: ['Parágrafo um.', 'Parágrafo dois.'] }] },
    en: { title: 'Post A en', excerpt: 'summary en', sections: [{ heading: 'Section one', paragraphs: ['Paragraph one.'] }] },
  },
  createdAt: '2026-04-10T00:00:00Z', updatedAt: '2026-04-10T00:00:00Z',
  scheduledFor: null, publishedAt: '2026-04-10T12:00:00Z',
  readingMinutes: { pt: 4, en: 3 }, ...over,
})

const mockApi = (posts: Post[]) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/blog/posts/')) {
      const slug = url.split('/').pop()!
      const found = posts.find((p) => p.slug === slug)
      return new Response(JSON.stringify(found ? { post: found } : { error: 'nf' }), { status: found ? 200 : 404 })
    }
    return new Response(JSON.stringify({ posts }), { status: 200 })
  }))

// o idioma vem do localStorage (padrão 'en'); os testes abaixo fixam pt de propósito
beforeEach(() => localStorage.setItem('lang', 'pt'))
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
const r = (slug: string | null) => render(<I18nProvider><BlogPage slug={slug} /></I18nProvider>)

describe('BlogPage — lista', () => {
  it('mostra um cartão por post, com título, resumo e tempo de leitura', async () => {
    mockApi([post(), post({ id: '2', slug: 'b', i18n: { pt: { title: 'Post B pt', excerpt: 'r', sections: [] }, en: { title: 'B', excerpt: 'r', sections: [] } } })])
    r(null)
    const items = await screen.findAllByRole('article')
    expect(items).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Post A pt/ })).toHaveAttribute('href', '/blog/a')
    expect(items[0]).toHaveTextContent('4')
  })

  it('a capa vem pela nossa rota de imagem', async () => {
    mockApi([post()])
    r(null)
    const img = await screen.findByRole('img', { name: 'capa' })
    expect(img).toHaveAttribute('src', '/api/blog/image/abc123.jpg')
  })

  it('post sem capa continua aparecendo', async () => {
    mockApi([post({ image: null })])
    r(null)
    expect(await screen.findByRole('article')).toHaveTextContent('Post A pt')
  })

  it('em inglês o cartão mostra o corpo em inglês', async () => {
    localStorage.setItem('lang', 'en')
    mockApi([post()])
    r(null)
    expect(await screen.findByRole('link', { name: /Post A en/ })).toBeInTheDocument()
  })

  it('blog vazio mostra aviso em vez de tela em branco', async () => {
    mockApi([])
    r(null)
    expect(await screen.findByText(/nenhum log|no logs/i)).toBeInTheDocument()
  })
})

describe('BlogPage — post', () => {
  it('título como h1, seções com subtítulo e parágrafos', async () => {
    mockApi([post()])
    r('a')
    expect(await screen.findByRole('heading', { level: 1, name: 'Post A pt' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Seção um' })).toBeInTheDocument()
    expect(screen.getByText('Parágrafo um.')).toBeInTheDocument()
    expect(screen.getByText('Parágrafo dois.')).toBeInTheDocument()
  })

  it('o corpo é texto, nunca HTML do modelo', async () => {
    mockApi([post({ i18n: { pt: { title: 'X', excerpt: '', sections: [{ heading: 'h', paragraphs: ['<script>window.__pwned=1</script><b>oi</b>'] }] }, en: { title: 'X', excerpt: '', sections: [] } } })])
    r('a')
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('b')).toBeNull()
    expect(screen.getByText(/<b>oi<\/b>/)).toBeInTheDocument()
  })

  it('crédito da imagem aparece', async () => {
    mockApi([post()])
    r('a')
    expect(await screen.findByText(/Gerada com IA/)).toBeInTheDocument()
  })

  it('slug inexistente mostra 404 amigável com link para a lista', async () => {
    mockApi([post()])
    r('nope')
    expect(await screen.findByText(/LOG NOT FOUND/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /TODOS OS LOGS/ })).toHaveAttribute('href', '/blog/')
  })

  it('o título da aba recebe o nome do post', async () => {
    mockApi([post()])
    r('a')
    await screen.findByRole('heading', { level: 1 })
    expect(document.title).toContain('Post A pt')
  })
})
