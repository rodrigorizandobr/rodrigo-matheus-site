import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n/useI18n'
import { BlogPage } from './BlogPage'

const posts = [
  { slug: 'a', date: '2026-04-10', tags: ['cloud'], i18n: { en: { title: 'Post A', summary: 'sum a', body: '<p>Body <strong>A</strong></p>' }, pt: { title: 'Post A pt', summary: 's', body: '<p>Corpo A</p>' } } },
  { slug: 'b', date: '2026-04-08', tags: ['ai'], i18n: { en: { title: 'Post B', summary: 'sum b', body: '<p>Body B</p>' }, pt: { title: 'Post B pt', summary: 's', body: '' } } },
]
afterEach(() => vi.unstubAllGlobals())
const r = (slug: string | null) => render(<I18nProvider><BlogPage slug={slug} /></I18nProvider>)

describe('BlogPage — LOGS no design novo', () => {
  it('lista: todos os posts, mais recente primeiro, com link para o slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(posts), { status: 200 })))
    r(null)
    const items = await screen.findAllByRole('article')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Post A')
    expect(screen.getByRole('link', { name: /Post A/ })).toHaveAttribute('href', '/blog/a')
  })
  it('post: título como h1, corpo renderizado, link de volta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(posts), { status: 200 })))
    r('a')
    expect(await screen.findByRole('heading', { level: 1, name: 'Post A' })).toBeInTheDocument()
    expect(screen.getByText('A', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ALL LOGS/ })).toHaveAttribute('href', '/blog/')
    expect(document.title).toContain('Post A')
  })
  it('slug inexistente: 404 amigável com link para a lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(posts), { status: 200 })))
    r('nope')
    expect(await screen.findByText(/LOG NOT FOUND/)).toBeInTheDocument()
  })
  it('corpo passa por sanitização: script não vai para o DOM', async () => {
    const evil = [{ ...posts[0], i18n: { en: { title: 'X', summary: '', body: '<p>ok</p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">' }, pt: { title: 'X', summary: '', body: '' } } }]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(evil), { status: 200 })))
    r('a')
    await screen.findByText('ok')
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('img[onerror]')).toBeNull()
  })
})
