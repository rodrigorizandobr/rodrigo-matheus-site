import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostEditor } from './PostEditor'
import type { Post } from '../../blog/types'

const LONGO = 'Como combinar BMad, Spec Kit e Super Powers destrói o caos na programação com IA e entrega software de verdade'

const post = (over: Partial<Post> = {}): Post => ({
  id: '1', slug: 'meu-post-abc', status: 'draft', tags: ['ia'],
  image: null, imageAlt: '',
  i18n: {
    pt: { title: LONGO, excerpt: 'Resumo PT', sections: [{ heading: 'Seção', paragraphs: ['Parágrafo.'] }] },
    en: { title: 'Title EN', excerpt: 'Excerpt EN', sections: [{ heading: 'Section', paragraphs: ['Paragraph.'] }] },
  },
  linkedinEnabled: true, linkedinPostedAt: null,
  createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  scheduledFor: null, publishedAt: null, ...over,
})

const props = (over = {}) => ({
  post: post(), busy: null, dirty: false,
  onChange: vi.fn(), onSave: vi.fn(), onRevise: vi.fn(), onCover: vi.fn(),
  onPublish: vi.fn(), onUnpublish: vi.fn(), onSchedule: vi.fn(), onDelete: vi.fn(),
  onClose: vi.fn(), onPreview: vi.fn(), onPickCover: vi.fn(), onClearCover: vi.fn(),
  onToggleLinkedin: vi.fn(), onShareLinkedin: vi.fn(), ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('título do post', () => {
  it('é um campo que quebra linha: título comprido aparece inteiro, não cortado', () => {
    render(<PostEditor {...props()} />)
    const campo = screen.getByRole('textbox', { name: /^título/i })
    expect(campo.tagName).toBe('TEXTAREA')
    expect(campo).toHaveValue(LONGO)
  })

  it('digitar avisa quem chamou com o título novo', async () => {
    const onChange = vi.fn()
    render(<PostEditor {...props({ onChange })} />)
    await userEvent.type(screen.getByRole('textbox', { name: /^título/i }), '!')
    expect(onChange.mock.calls.at(-1)![0].i18n.pt.title).toBe(`${LONGO}!`)
  })

  it('Enter não abre uma segunda linha: título é uma frase só', async () => {
    const onChange = vi.fn()
    render(<PostEditor {...props({ onChange })} />)
    await userEvent.type(screen.getByRole('textbox', { name: /^título/i }), '{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('estado e publicação', () => {
  it.each([['draft', 'rascunho'], ['scheduled', 'agendado'], ['published', 'no ar']])(
    'selo de %s diz "%s", em português', (status, rotulo) => {
      render(<PostEditor {...props({ post: post({ status: status as never, scheduledFor: '2026-09-20T11:00:00Z', publishedAt: '2026-09-16T11:00:00Z', slug: 'x' }) })} />)
      expect(screen.getAllByText(rotulo, { selector: '.badge' })).toHaveLength(1)
    })

  it('rascunho oferece publicar agora e abre o agendamento sob demanda', async () => {
    const onPublish = vi.fn(); const onSchedule = vi.fn()
    render(<PostEditor {...props({ onPublish, onSchedule })} />)
    await userEvent.click(screen.getByRole('button', { name: /publicar agora/i }))
    expect(onPublish).toHaveBeenCalled()
    await userEvent.click(screen.getByText(/agendar para depois/i))
    await userEvent.click(screen.getByRole('button', { name: /^agendar$/i }))
    expect(onSchedule).toHaveBeenCalledWith(expect.any(Date))
  })

  it('post no ar oferece tirar do ar e o link do site — e NÃO oferece agendar', () => {
    render(<PostEditor {...props({ post: post({ status: 'published', slug: 'no-ar', publishedAt: '2026-09-16T11:00:00Z' }) })} />)
    expect(screen.getByRole('button', { name: /tirar do ar/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ver no site/i })).toHaveAttribute('href', '/blog/no-ar')
    expect(screen.queryByText(/agendar para depois/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /publicar agora/i })).toBeNull()
  })

  it('rascunho não tem link do site — a página não existe', () => {
    render(<PostEditor {...props()} />)
    expect(screen.queryByRole('link', { name: /ver no site/i })).toBeNull()
  })
})

describe('salvar e sair', () => {
  it('limpo: salvar fica desabilitado e não há aviso', () => {
    render(<PostEditor {...props({ dirty: false })} />)
    expect(screen.getByRole('button', { name: /^salvar/i })).toBeDisabled()
    expect(screen.queryByText(/alterações não salvas/i)).toBeNull()
  })

  it('sujo: avisa, e salvar funciona', async () => {
    const onSave = vi.fn()
    render(<PostEditor {...props({ dirty: true, onSave })} />)
    expect(screen.getByText(/alterações não salvas/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^salvar/i }))
    expect(onSave).toHaveBeenCalled()
  })

  it('salvando: o botão diz que está salvando', () => {
    render(<PostEditor {...props({ dirty: true, busy: 'save' })} />)
    expect(screen.getByRole('button', { name: /salvando/i })).toBeDisabled()
  })

  it('voltar sem alterações sai direto', async () => {
    const onClose = vi.fn(); const confirmar = vi.spyOn(window, 'confirm')
    render(<PostEditor {...props({ onClose })} />)
    await userEvent.click(screen.getByRole('button', { name: /voltar à lista/i }))
    expect(confirmar).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('voltar com alterações pergunta, e "cancelar" fica no editor', async () => {
    const onClose = vi.fn(); vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PostEditor {...props({ dirty: true, onClose })} />)
    await userEvent.click(screen.getByRole('button', { name: /voltar à lista/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('voltar com alterações e "ok" descarta e sai', async () => {
    const onClose = vi.fn(); vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PostEditor {...props({ dirty: true, onClose })} />)
    await userEvent.click(screen.getByRole('button', { name: /voltar à lista/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('LinkedIn no editor', () => {
  it('inédito: checkbox da fila e botão para publicar agora', async () => {
    const onShareLinkedin = vi.fn(); const onToggleLinkedin = vi.fn()
    render(<PostEditor {...props({ post: post({ status: 'published', slug: 'x' }), onShareLinkedin, onToggleLinkedin })} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /publicar automaticamente no linkedin/i }))
    expect(onToggleLinkedin).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /^publicar no linkedin agora$/i }))
    expect(onShareLinkedin).toHaveBeenCalled()
  })

  it('já compartilhado: diz o dia, some o checkbox da fila e vira "publicar de novo"', async () => {
    const onShareLinkedin = vi.fn()
    render(<PostEditor {...props({ post: post({ status: 'published', slug: 'x', linkedinPostedAt: '2026-09-15T12:00:00Z' }), onShareLinkedin })} />)
    expect(screen.getByText(/no linkedin desde 15\/09\/2026/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /publicar automaticamente no linkedin/i })).toBeNull()
    expect(screen.queryByText(/uma vez só/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /publicar de novo no linkedin/i }))
    expect(onShareLinkedin).toHaveBeenCalled()
  })

  it('rascunho: o checkbox avisa que a fila só começa com o post no ar', () => {
    render(<PostEditor {...props()} />)
    expect(screen.getByText(/quando estiver no ar/i)).toBeInTheDocument()
  })
})

describe('excluir post', () => {
  it.each(['draft', 'scheduled', 'published'])('post %s tem o botão excluir', async (status) => {
    const onDelete = vi.fn()
    render(<PostEditor {...props({ post: post({ status: status as never, scheduledFor: '2026-09-20T11:00:00Z', slug: 'x' }), onDelete })} />)
    await userEvent.click(screen.getByRole('button', { name: /^excluir post$/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('o botão trava enquanto outra ação está em andamento', () => {
    render(<PostEditor {...props({ busy: 'revise' })} />)
    expect(screen.getByRole('button', { name: /^excluir post$/i })).toBeDisabled()
  })
})

describe('recorte de vídeo no editor', () => {
  it('pendente avisa que espera o Mac', () => {
    render(<PostEditor {...props({ post: post({ clip: { status: 'pending' } }) })} />)
    expect(screen.getByText(/aguardando o Mac/i)).toBeInTheDocument()
  })

  it('pronto diz canal e trecho e leva ao vídeo original no segundo certo', () => {
    const clip = { status: 'ready' as const, hash: 'c'.repeat(64), channel: 'Tesla', title: 'Roadster Event',
                   sourceUrl: 'https://www.youtube.com/watch?v=qt5p-_tE8d0', start: 1340, end: 1368 }
    render(<PostEditor {...props({ post: post({ clip }) })} />)
    expect(screen.getByText('Recorte pronto: Tesla, 22:20–22:48.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ver o original/i }))
      .toHaveAttribute('href', 'https://www.youtube.com/watch?v=qt5p-_tE8d0&t=1340s')
  })

  it('post sem recorte não mostra o cartão', () => {
    render(<PostEditor {...props()} />)
    expect(screen.queryByText(/^Vídeo$/)).toBeNull()
  })
})

describe('player do recorte no editor', () => {
  it('recorte pronto aparece como vídeo para assistir', () => {
    const clip = { status: 'ready' as const, hash: 'c'.repeat(64), channel: 'Tesla', title: 'Roadster Event', start: 437, end: 474 }
    const { container } = render(<PostEditor {...props({ post: post({ clip }) })} />)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video!.getAttribute('src')).toBe(`/api/blog/video/${'c'.repeat(64)}.mp4`)
    expect(video!.hasAttribute('controls')).toBe(true)
  })

  it('recorte pendente não tem player', () => {
    const { container } = render(<PostEditor {...props({ post: post({ clip: { status: 'pending' } }) })} />)
    expect(container.querySelector('video')).toBeNull()
  })
})

describe('visualizar no editor', () => {
  it('é um link para a prévia que abre em outra aba', async () => {
    const onPreview = vi.fn()
    render(<PostEditor {...props({ onPreview })} />)
    const link = screen.getByRole('link', { name: /^visualizar$/i })
    expect(link).toHaveAttribute('href', '/admin/visualizar/1')
    expect(link).toHaveAttribute('target', '_blank')
    link.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(link)
    expect(onPreview).toHaveBeenCalled()
  })
})

describe('afirmações sem fonte que sobraram', () => {
  it('o editor mostra cada trecho para o autor conferir', () => {
    const generation = { model: 'm', generatedAt: '', topic: 't', unsupportedLeft: ['Engenheiros torceram o nariz.'] }
    render(<PostEditor {...props({ post: post({ generation }) })} />)
    expect(screen.getByText(/sem fonte/i)).toBeInTheDocument()
    expect(screen.getByText(/Engenheiros torceram o nariz\./)).toBeInTheDocument()
  })

  it('sem sobra, nenhum aviso', () => {
    render(<PostEditor {...props({ post: post({ generation: { model: 'm', generatedAt: '', topic: 't', unsupportedLeft: [] } }) })} />)
    expect(screen.queryByText(/sem fonte/i)).toBeNull()
  })
})

describe('LinkedIn no editor: só manual', () => {
  it.each(['draft', 'scheduled', 'published'])('post %s: o checkbox existe e reflete o estado', (status) => {
    const { rerender } = render(<PostEditor {...props({ post: post({ status: status as never, linkedinEnabled: true }) })} />)
    expect(screen.getByRole('checkbox', { name: /publicar automaticamente no linkedin/i })).toBeChecked()
    rerender(<PostEditor {...props({ post: post({ status: status as never, linkedinEnabled: false }) })} />)
    expect(screen.getByRole('checkbox', { name: /publicar automaticamente no linkedin/i })).not.toBeChecked()
  })

  it('desmarcado: o texto diz que só sai quando o autor mandar', () => {
    render(<PostEditor {...props({ post: post({ status: 'published', slug: 'x', linkedinEnabled: false }) })} />)
    expect(screen.getByText(/só sai quando você clicar em .publicar no linkedin agora./i)).toBeInTheDocument()
  })
})
