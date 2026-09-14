import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostList } from './PostList'
import { PostPreview } from './PostPreview'
import type { Post } from '../../blog/types'

const post = (over: Partial<Post> = {}): Post => ({
  id: '1', slug: 'meu-post-abc', status: 'draft', tags: ['ia'],
  image: { hash: 'h'.repeat(64), provider: 'gemini', credit: 'Gerada com IA', sourceUrl: '', alt: 'capa' },
  imageAlt: 'capa',
  i18n: {
    pt: { title: 'Título PT', excerpt: 'Resumo PT', sections: [{ heading: 'Seção', paragraphs: ['Parágrafo.'] }] },
    en: { title: 'Title EN', excerpt: 'Excerpt EN', sections: [{ heading: 'Section', paragraphs: ['Paragraph.'] }] },
  },
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  scheduledFor: null, publishedAt: null, ...over,
})

describe('PostList — ações de cada post', () => {
  it('rascunho também tem visualizar: é o único jeito de ver antes de publicar', async () => {
    const onPreview = vi.fn()
    render(<PostList posts={[post({ status: 'draft' })]} onPreview={onPreview} onEdit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /visualizar/i }))
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('post publicado ganha também um link para a página real', () => {
    render(<PostList posts={[post({ status: 'published', slug: 'no-ar' })]} onPreview={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByRole('link', { name: /no site/i })).toHaveAttribute('href', '/blog/no-ar')
  })

  it('rascunho NÃO oferece link para o site — a página não existe ainda', () => {
    render(<PostList posts={[post({ status: 'draft' })]} onPreview={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /no site/i })).toBeNull()
  })

  it('mostra o estado e a data de cada post', () => {
    render(<PostList posts={[post({ status: 'scheduled', scheduledFor: '2026-09-20T11:00:00Z' })]} onPreview={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('scheduled')).toBeInTheDocument()
    expect(screen.getByText('2026-09-20')).toBeInTheDocument()
  })

  it('post sem título ainda aparece na lista, com aviso', () => {
    const vazio = post({ i18n: { pt: { title: '', excerpt: '', sections: [] }, en: { title: '', excerpt: '', sections: [] } } })
    render(<PostList posts={[vazio]} onPreview={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText(/sem título/i)).toBeInTheDocument()
  })

  it('editar chama de volta com o post', async () => {
    const onEdit = vi.fn()
    render(<PostList posts={[post()]} onPreview={vi.fn()} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^editar$/i }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})

describe('PostPreview — vê o post como o leitor veria', () => {
  it('renderiza o post e avisa que é rascunho', () => {
    render(<PostPreview post={post({ status: 'draft' })} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Título PT' })).toBeInTheDocument()
    expect(screen.getByText('Parágrafo.')).toBeInTheDocument()
    expect(screen.getByText(/rascunho/i)).toBeInTheDocument()
  })

  it('não avisa nada quando o post já está no ar', () => {
    render(<PostPreview post={post({ status: 'published' })} onClose={vi.fn()} />)
    expect(screen.queryByText(/não está no ar/i)).toBeNull()
  })

  it('dá para conferir os dois idiomas', async () => {
    render(<PostPreview post={post()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Title EN' })).toBeInTheDocument()
  })

  it('fecha no botão e no Esc', async () => {
    const onClose = vi.fn()
    render(<PostPreview post={post()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /fechar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('o tempo de leitura é calculado na hora — rascunho não tem o do servidor', () => {
    const longo = post({
      readingMinutes: undefined,
      i18n: { pt: { title: 'T', excerpt: '', sections: [{ heading: '', paragraphs: ['palavra '.repeat(600)] }] },
              en: { title: 'T', excerpt: '', sections: [] } },
    })
    render(<PostPreview post={longo} onClose={vi.fn()} />)
    expect(screen.getByText(/3 min/)).toBeInTheDocument()
  })
})
