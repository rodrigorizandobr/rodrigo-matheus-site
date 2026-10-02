import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  linkedinEnabled: true, linkedinPostedAt: null,
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  scheduledFor: null, publishedAt: null, ...over,
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
