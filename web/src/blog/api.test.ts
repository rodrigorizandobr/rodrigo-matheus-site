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

describe('biblioteca de mídia', () => {
  const token = async () => 'jwt-123'

  it('upload vai como multipart, com o token, e sem content-type na mão', async () => {
    const f = fetchOk({ item: { hash: 'h' } }, 201)
    vi.stubGlobal('fetch', f)
    const file = new File(['bytes'], 'foto.png', { type: 'image/png' })
    await blogApi.admin(token).media.upload(file, 'legenda')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/blog/admin/media/upload')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['content-type']).toBeUndefined()
  })

  it('upload grande demais (413) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'arquivo acima de 12 MB' }, 413))
    const file = new File(['x'], 'g.png', { type: 'image/png' })
    await expect(blogApi.admin(token).media.upload(file)).rejects.toThrow(/12 MB/)
  })

  it('busca no banco de imagens escapa o termo', async () => {
    const f = fetchOk({ results: [] })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).media.searchStock('lab & robô')
    expect(f.mock.calls[0][0]).toBe('/api/blog/admin/media/stock?q=lab%20%26%20rob%C3%B4')
  })

  it('importar a escolhida manda url, crédito e origem', async () => {
    const f = fetchOk({ item: {} }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).media.importStock(
      { id: '1', thumb: 't', url: 'b.jpg', credit: 'A / Pixabay', sourceUrl: 'https://p', width: 1, height: 1 }, 'alt')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual(
      { url: 'b.jpg', credit: 'A / Pixabay', sourceUrl: 'https://p', alt: 'alt' })
  })

  it('escolher capa da biblioteca manda o hash; null tira a capa', async () => {
    const f = fetchOk({ post: post() })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).setCover('1', 'abc')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ hash: 'abc' })
    await blogApi.admin(token).setCover('1', null)
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ hash: null })
  })

  it('gerar post leva a escolha de pesquisar na web', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token).generate('tema', false)
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ topic: 'tema', context: '', research: false })
  })
})
