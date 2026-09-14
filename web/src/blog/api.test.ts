import { describe, it, expect, vi, beforeEach } from 'vitest'
import { blogApi, ApiError } from './api'
import { coverUrl, bodyFor } from './types'
import type { Post } from './types'

const post = (over: Partial<Post> = {}): Post => ({
  id: '1', slug: 's', status: 'published', tags: [], image: null, imageAlt: '',
  i18n: { pt: { title: 'PT', excerpt: 'e', sections: [] }, en: { title: 'EN', excerpt: 'e', sections: [] } },
  createdAt: '', updatedAt: '', scheduledFor: null, publishedAt: null, ...over,
})

const fetchOk = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

beforeEach(() => vi.restoreAllMocks())

describe('helpers de tipo', () => {
  it('capa sempre passa pela nossa rota, nunca pela origem', () => {
    expect(coverUrl({ hash: 'abc', provider: 'gemini', credit: '', sourceUrl: 'https://pixabay/x', alt: '' }))
      .toBe('/api/blog/image/abc.jpg')
    expect(coverUrl(null)).toBeNull()
  })
  it('idioma faltando cai no outro em vez de sumir com o post', () => {
    const p = post({ i18n: { en: { title: 'EN', excerpt: 'e', sections: [] } } as never })
    expect(bodyFor(p, 'pt').title).toBe('EN')
  })
})

describe('leitura pública', () => {
  it('lista posts', async () => {
    vi.stubGlobal('fetch', fetchOk({ posts: [post()] }))
    expect((await blogApi.list())[0].slug).toBe('s')
  })
  it('post inexistente devolve null em vez de estourar', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'not found' }, 404))
    expect(await blogApi.get('x')).toBeNull()
  })
  it('erro de servidor vira ApiError com o status', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'boom' }, 500))
    await expect(blogApi.list()).rejects.toThrow(ApiError)
  })
  it('rede caída vira ApiError legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(blogApi.list()).rejects.toThrow(/offline|rede/i)
  })
})

describe('painel', () => {
  const token = async () => 'jwt-123'

  it('toda chamada de admin manda o token no header', async () => {
    const f = fetchOk({ posts: [] })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).list()
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123')
  })

  it('gerar manda o tema', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).generate('meu tema')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ topic: 'meu tema', context: '' })
  })

  it('pauta esgotada (409) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'a pauta acabou' }, 409))
    await expect(blogApi.admin(token).generate()).rejects.toThrow(/pauta acabou/)
  })

  it('sessão expirada (401) é distinguível para a tela pedir novo login', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'token inválido' }, 401))
    await expect(blogApi.admin(token).list()).rejects.toMatchObject({ status: 401 })
  })

  it('agendar envia a data em ISO com Z', async () => {
    const f = fetchOk({ post: post() })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).schedule('1', new Date('2026-09-20T11:00:00Z'))
    expect(JSON.parse(f.mock.calls[0][1].body).when).toBe('2026-09-20T11:00:00.000Z')
  })

  it('salvar config manda só o que mudou', async () => {
    const f = fetchOk({ config: {} })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).saveConfig({ publish_hour: 19 })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ publish_hour: 19 })
    expect(f.mock.calls[0][1].method).toBe('PATCH')
  })
})
