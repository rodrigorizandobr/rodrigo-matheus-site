import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostList } from './PostList'
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

const props = (over = {}) => ({
  posts: [post()], onPreview: vi.fn(), onEdit: vi.fn(), onTogglePublish: vi.fn(),
  onToggleLinkedin: vi.fn(), onShareLinkedin: vi.fn(), onDelete: vi.fn(), ...over,
})

const abrirMenu = () => userEvent.click(screen.getByRole('button', { name: /mais ações/i }))

describe('PostList — ações de cada post', () => {
  it('rascunho também tem visualizar: é o único jeito de ver antes de publicar', async () => {
    const onPreview = vi.fn()
    render(<PostList {...props({ onPreview })} />)
    await userEvent.click(screen.getByRole('button', { name: /visualizar/i }))
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('mostra o estado em português e a data no formato brasileiro', () => {
    render(<PostList {...props({ posts: [post({ status: 'scheduled', scheduledFor: '2026-09-20T11:00:00Z' })] })} />)
    expect(screen.getByText('agendado')).toBeInTheDocument()
    expect(screen.queryByText('scheduled')).toBeNull()
    expect(screen.getByText('20/09/2026')).toBeInTheDocument()
  })

  it('post sem título ainda aparece na lista, com aviso', () => {
    const vazio = post({ i18n: { pt: { title: '', excerpt: '', sections: [] }, en: { title: '', excerpt: '', sections: [] } } })
    render(<PostList {...props({ posts: [vazio] })} />)
    expect(screen.getByText(/sem título/i)).toBeInTheDocument()
  })

  it.each([
    ['draft', 'publicar'],
    ['scheduled', 'publicar'],
    ['published', 'despublicar'],
  ])('post %s mostra o botao %s direto na lista', async (status, rotulo) => {
    const onTogglePublish = vi.fn()
    render(<PostList {...props({ posts: [post({ status: status as never })], onTogglePublish })} />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${rotulo}$`, 'i') }))
    expect(onTogglePublish).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('editar chama de volta com o post', async () => {
    const onEdit = vi.fn()
    render(<PostList {...props({ onEdit })} />)
    await userEvent.click(screen.getByRole('button', { name: /^editar$/i }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('a ação fica desabilitada enquanto outra está em andamento', () => {
    render(<PostList {...props({ busyId: '1' })} />)
    expect(screen.getByRole('button', { name: /^(despublicar|publicar)$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^editar$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /mais ações/i })).toBeDisabled()
  })

  it('a linha mostra só o essencial: o resto fica no menu fechado', () => {
    render(<PostList {...props({ posts: [post({ status: 'published' })] })} />)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('button', { name: /publicar no linkedin/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /excluir/i })).toBeNull()
  })
})

describe('menu "mais ações"', () => {
  it('post no ar tem o link da página real', async () => {
    render(<PostList {...props({ posts: [post({ status: 'published', slug: 'no-ar' })] })} />)
    await abrirMenu()
    expect(screen.getByRole('menuitem', { name: /ver no site/i })).toHaveAttribute('href', '/blog/no-ar')
  })

  it('rascunho NÃO oferece link para o site — a página não existe ainda', async () => {
    render(<PostList {...props()} />)
    await abrirMenu()
    expect(screen.queryByRole('menuitem', { name: /ver no site/i })).toBeNull()
  })

  it('Escape fecha o menu', async () => {
    render(<PostList {...props()} />)
    await abrirMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('clicar fora fecha o menu', async () => {
    render(<div><p>fora</p><PostList {...props()} /></div>)
    await abrirMenu()
    await userEvent.click(screen.getByText('fora'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('excluir avisa qual post e fecha o menu', async () => {
    const onDelete = vi.fn()
    render(<PostList {...props({ onDelete })} />)
    await abrirMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /^excluir$/i }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('marca do LinkedIn em cada post', () => {
  const publicado = (over = {}) => props({ posts: [post({ status: 'published', ...over })] })

  it('post publicado mostra que está na fila do LinkedIn', () => {
    render(<PostList {...publicado()} />)
    expect(screen.getByRole('button', { name: /^linkedin$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('post sem o campo conta como habilitado — o padrão é compartilhar', () => {
    const semCampo = post({ status: 'published' })
    delete (semCampo as Record<string, unknown>).linkedinEnabled
    render(<PostList {...props({ posts: [semCampo] })} />)
    expect(screen.getByRole('button', { name: /^linkedin$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicar alterna e avisa quem chamou', async () => {
    const onToggleLinkedin = vi.fn()
    render(<PostList {...props({ posts: [post({ status: 'published' })], onToggleLinkedin })} />)
    await userEvent.click(screen.getByRole('button', { name: /^linkedin$/i }))
    expect(onToggleLinkedin).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('post já compartilhado diz quando foi, em português, e não oferece alternar', () => {
    render(<PostList {...publicado({ linkedinPostedAt: '2026-09-15T12:00:00Z' })} />)
    expect(screen.getByText('no LinkedIn · 15/09/2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^linkedin$/i })).toBeNull()
  })

  it('a marca de compartilhado vale em qualquer estado, até rascunho', () => {
    render(<PostList {...props({ posts: [post({ status: 'draft', linkedinPostedAt: '2026-09-15T12:00:00Z' })] })} />)
    expect(screen.getByText('no LinkedIn · 15/09/2026')).toBeInTheDocument()
  })

  it('rascunho não mostra a marca da fila — ele nem entra nela', () => {
    render(<PostList {...props()} />)
    expect(screen.queryByRole('button', { name: /^linkedin$/i })).toBeNull()
  })
})

describe('"publicar no LinkedIn" no menu', () => {
  const item = () => screen.queryByRole('menuitem', { name: /publicar (de novo )?no linkedin/i })

  it('post no ar ainda não compartilhado: o item avisa qual post', async () => {
    const onShareLinkedin = vi.fn()
    render(<PostList {...props({ posts: [post({ status: 'published' })], onShareLinkedin })} />)
    await abrirMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /^publicar no linkedin$/i }))
    expect(onShareLinkedin).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('vale mesmo com o post fora da fila automática — o clique é a decisão', async () => {
    render(<PostList {...props({ posts: [post({ status: 'published', linkedinEnabled: false })] })} />)
    await abrirMenu()
    expect(item()).toBeInTheDocument()
  })

  it.each(['draft', 'scheduled', 'published'])('aparece em post %s', async (status) => {
    render(<PostList {...props({ posts: [post({ status: status as never })] })} />)
    await abrirMenu()
    expect(item()).toBeInTheDocument()
  })

  it('post que já foi ao LinkedIn diz "de novo": o autor pode repetir, sabendo', async () => {
    render(<PostList {...props({ posts: [post({ status: 'published', linkedinPostedAt: '2026-09-15T12:00:00Z' })] })} />)
    await abrirMenu()
    expect(screen.getByRole('menuitem', { name: /^publicar de novo no linkedin$/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^publicar no linkedin$/i })).toBeNull()
  })
})
