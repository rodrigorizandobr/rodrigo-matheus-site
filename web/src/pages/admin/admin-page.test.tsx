import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Post } from '../../blog/types'

const api = vi.hoisted(() => ({
  list: vi.fn(), config: vi.fn(), update: vi.fn(), publish: vi.fn(), remove: vi.fn(),
  shareToLinkedin: vi.fn(), linkedin: { status: vi.fn() },
}))

vi.mock('../../blog/firebase', () => ({
  idToken: async () => 't',
  signInWithGoogle: vi.fn(), signOutAdmin: vi.fn(),
  watchUser: (cb: (u: { email: string }) => void) => { cb({ email: 'eu@example.com' }); return () => {} },
}))
vi.mock('../../blog/api', async (orig) => ({
  ...(await orig<typeof import('../../blog/api')>()),
  blogApi: { admin: () => api },
}))

import { AdminPage } from '../AdminPage'

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1', slug: 'um-post', status: 'draft', tags: ['ia'], image: null, imageAlt: '',
  i18n: {
    pt: { title: 'Título original', excerpt: 'Resumo', sections: [{ heading: 'S', paragraphs: ['P.'] }] },
    en: { title: 'Original title', excerpt: 'Excerpt', sections: [{ heading: 'S', paragraphs: ['P.'] }] },
  },
  linkedinEnabled: true, linkedinPostedAt: null,
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  scheduledFor: null, publishedAt: null, ...over,
})

const config = {
  timezone: 'America/Sao_Paulo', auto_publish: false, delay_days: 2, publish_hour: 8,
  generate_hour: 6, generate_weekdays: [], research_enabled: true, news_terms: [],
  linkedin_enabled: true, linkedin_weekdays: [], linkedin_hour: 9,
}

beforeEach(() => {
  Object.values(api).forEach((f) => { if (typeof f === 'function') f.mockReset() })
  api.linkedin.status.mockResolvedValue(null)
  api.list.mockResolvedValue([post()])
  api.config.mockResolvedValue(config)
})
afterEach(() => vi.restoreAllMocks())

const abrirEditor = async () => {
  render(<AdminPage />)
  await userEvent.click(await screen.findByRole('button', { name: /^editar$/i }))
}

describe('excluir pela lista', () => {
  it('"cancelar" na confirmação não apaga nada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: /mais ações/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^excluir$/i }))
    expect(api.remove).not.toHaveBeenCalled()
    expect(screen.getByText('Título original')).toBeInTheDocument()
  })

  it('a confirmação cita o título; "ok" apaga e o post some da lista', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.remove.mockResolvedValue({ ok: true })
    render(<AdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: /mais ações/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^excluir$/i }))
    expect(confirmar.mock.calls[0][0]).toContain('Título original')
    expect(api.remove).toHaveBeenCalledWith('p1')
    await waitFor(() => expect(screen.queryByText('Título original')).toBeNull())
  })
})

describe('excluir pelo editor', () => {
  it('apaga, fecha o editor e volta para a lista sem o post', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.remove.mockResolvedValue({ ok: true })
    await abrirEditor()
    await userEvent.click(screen.getByRole('button', { name: /^excluir post$/i }))
    expect(api.remove).toHaveBeenCalledWith('p1')
    await waitFor(() => expect(screen.getByText(/nenhum post ainda/i)).toBeInTheDocument())
  })
})

describe('texto ainda não salvo', () => {
  it('publicar grava o texto ANTES de publicar', async () => {
    const salvo = post({ i18n: { ...post().i18n, pt: { ...post().i18n.pt, title: 'Título original!' } } })
    api.update.mockResolvedValue(salvo)
    api.publish.mockResolvedValue({ ...salvo, status: 'published', publishedAt: '2026-10-02T12:00:00Z' })
    await abrirEditor()
    await userEvent.type(screen.getByRole('textbox', { name: /^título/i }), '!')
    expect(screen.getByText(/alterações não salvas/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /publicar agora/i }))

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('p1'))
    expect(api.update).toHaveBeenCalledWith('p1', expect.objectContaining({
      i18n: expect.objectContaining({ pt: expect.objectContaining({ title: 'Título original!' }) }),
    }))
    expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.publish.mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByText(/alterações não salvas/i)).toBeNull())
  })

  it('a lista não mostra o texto digitado antes de salvar', async () => {
    api.list.mockResolvedValue([post()])
    await abrirEditor()
    await userEvent.type(screen.getByRole('textbox', { name: /^título/i }), ' extra')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: /voltar à lista/i }))
    expect(await screen.findByText('Título original')).toBeInTheDocument()
    expect(screen.queryByText('Título original extra')).toBeNull()
  })

  it('trocar de aba com alterações pergunta; "cancelar" fica no editor', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await abrirEditor()
    await userEvent.type(screen.getByRole('textbox', { name: /^título/i }), '!')
    await userEvent.click(screen.getByRole('button', { name: /^mídia$/i }))
    expect(confirmar).toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /^título/i })).toBeInTheDocument()
  })

  it('sem alterações, trocar de aba não pergunta nada', async () => {
    const confirmar = vi.spyOn(window, 'confirm')
    await abrirEditor()
    await userEvent.click(screen.getByRole('button', { name: /^configuração$/i }))
    expect(confirmar).not.toHaveBeenCalled()
  })
})
