import { describe, it, expect, vi, beforeEach } from 'vitest'
import { blogApi, ApiError, LONG_BASE } from './api'
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

/** a prova de que a chamada sai do site, num navegador de verdade (App Check) */
const proof = async () => 'prova-123'

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
    await blogApi.admin(token, proof).list()
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123')
  })

  it('toda chamada de admin manda também a prova do navegador', async () => {
    const f = fetchOk({ posts: [] })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).list()
    expect(f.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe('prova-123')
  })

  it('operação longa, que vai direto ao Cloud Run, manda a prova do mesmo jeito', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).generate('tema')
    const [url, init] = f.mock.calls[0]
    expect(url.startsWith(LONG_BASE)).toBe(true)
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
  })

  it('upload manda a prova junto do token', async () => {
    const f = fetchOk({ item: { hash: 'h' } }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).media.upload(new File(['bytes'], 'foto.png', { type: 'image/png' }))
    expect(f.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe('prova-123')
  })

  it('sem a prova a chamada nem sai, e o erro diz o que fazer', async () => {
    const f = fetchOk({ posts: [] })
    vi.stubGlobal('fetch', f)
    const semProva = async () => { throw new Error('Não deu para confirmar que este acesso vem do site.') }
    await expect(blogApi.admin(token, semProva).list()).rejects.toThrow(/confirmar que este acesso vem do site/)
    expect(f).not.toHaveBeenCalled()
  })

  it('recusa da portaria (403) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'Não deu para confirmar que este acesso vem do site.', code: 'app_check' }, 403))
    await expect(blogApi.admin(token, proof).list()).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/vem do site/) })
  })

  it('gerar manda o tema', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).generate('meu tema')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ topic: 'meu tema', context: '' })
  })

  it('pauta esgotada (409) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'a pauta acabou' }, 409))
    await expect(blogApi.admin(token, proof).generate()).rejects.toThrow(/pauta acabou/)
  })

  it('sessão expirada (401) é distinguível para a tela pedir novo login', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'token inválido' }, 401))
    await expect(blogApi.admin(token, proof).list()).rejects.toMatchObject({ status: 401 })
  })

  it('agendar envia a data em ISO com Z', async () => {
    const f = fetchOk({ post: post() })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).schedule('1', new Date('2026-09-20T11:00:00Z'))
    expect(JSON.parse(f.mock.calls[0][1].body).when).toBe('2026-09-20T11:00:00.000Z')
  })

  it('salvar config manda só o que mudou', async () => {
    const f = fetchOk({ config: {} })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).saveConfig({ publish_hour: 19 })
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
    await blogApi.admin(token, proof).media.upload(file, 'legenda')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/blog/admin/media/upload')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['content-type']).toBeUndefined()
  })

  it('upload grande demais (413) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'arquivo acima de 12 MB' }, 413))
    const file = new File(['x'], 'g.png', { type: 'image/png' })
    await expect(blogApi.admin(token, proof).media.upload(file)).rejects.toThrow(/12 MB/)
  })

  it('busca no banco de imagens escapa o termo', async () => {
    const f = fetchOk({ results: [] })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).media.searchStock('lab & robô')
    expect(f.mock.calls[0][0]).toBe('/api/blog/admin/media/stock?q=lab%20%26%20rob%C3%B4')
  })

  it('importar a escolhida manda url, crédito e origem', async () => {
    const f = fetchOk({ item: {} }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).media.importStock(
      { id: '1', thumb: 't', url: 'b.jpg', credit: 'A / Pixabay', sourceUrl: 'https://p', width: 1, height: 1 }, 'alt')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual(
      { url: 'b.jpg', credit: 'A / Pixabay', sourceUrl: 'https://p', alt: 'alt' })
  })

  it('escolher capa da biblioteca manda o hash; null tira a capa', async () => {
    const f = fetchOk({ post: post() })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).setCover('1', 'abc')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ hash: 'abc' })
    await blogApi.admin(token, proof).setCover('1', null)
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ hash: null })
  })

  it('gerar post leva a escolha de pesquisar na web', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).generate('tema', false)
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ topic: 'tema', context: '', research: false })
  })
})

describe('escrever sobre um tema', () => {
  const token = async () => 'jwt-123'

  it('manda o tema no modo "topic", que pesquisa na internet', async () => {
    const f = fetchOk({ post: post() }, 201)
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).generateFromTopic('RAG em produção')
    expect(f.mock.calls[0][0]).toBe(`${LONG_BASE}/api/blog/admin/generate`)
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ topic: 'RAG em produção', mode: 'topic' })
  })

  it('busca sem material (422) chega com a explicação do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'Nada escrito: a busca não trouxe material' }, 422))
    await expect(blogApi.admin(token, proof).generateFromTopic('x')).rejects.toThrow(/Nada escrito/)
  })
})

describe('LinkedIn', () => {
  const token = async () => 'jwt-123'

  it('o status vai com o token e não pede corpo', async () => {
    const f = fetchOk({ connected: false, hasApp: false })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).linkedin.status()
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123')
    expect(f.mock.calls[0][1].body).toBeUndefined()
  })

  it('conectar devolve a URL de autorização', async () => {
    vi.stubGlobal('fetch', fetchOk({ url: 'https://www.linkedin.com/oauth/v2/authorization?x=1' }))
    expect(await blogApi.admin(token, proof).linkedin.connect()).toContain('linkedin.com/oauth')
  })

  it('sem app cadastrado (409) chega com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'cadastre o app do LinkedIn' }, 409))
    await expect(blogApi.admin(token, proof).linkedin.connect()).rejects.toThrow(/cadastre o app/)
  })

  it('compartilhar agora devolve null quando a fila está vazia', async () => {
    vi.stubGlobal('fetch', fetchOk({ post: null }))
    expect(await blogApi.admin(token, proof).linkedin.shareNow()).toBeNull()
  })

  it('marcar um post para não ir ao LinkedIn é um PATCH comum', async () => {
    const f = fetchOk({ post: post() })
    vi.stubGlobal('fetch', f)
    await blogApi.admin(token, proof).update('1', { linkedinEnabled: false })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ linkedinEnabled: false })
  })
})

describe('operações longas vão direto ao Cloud Run (o Hosting corta em 60 s)', () => {
  const token = async () => 'jwt-123'
  const urlOf = async (run: () => Promise<unknown>, body: unknown = { post: post() }) => {
    const f = fetchOk(body, 200)
    vi.stubGlobal('fetch', f)
    await run()
    return f.mock.calls[0][0] as string
  }

  it.each([
    ['gerar', () => blogApi.admin(token, proof).generate('t'), '/api/blog/admin/generate'],
    ['gerar por tema', () => blogApi.admin(token, proof).generateFromTopic('t'), '/api/blog/admin/generate'],
    ['reflexão', () => blogApi.admin(token, proof).generateReflection('t'), '/api/blog/admin/generate'],
    ['revisar', () => blogApi.admin(token, proof).revise('9', 'mais curto'), '/api/blog/admin/posts/9/revise'],
    ['capa por IA', () => blogApi.admin(token, proof).cover('9', 'cena'), '/api/blog/admin/posts/9/cover'],
    ['compartilhar no LinkedIn', () => blogApi.admin(token, proof).shareToLinkedin('9'), '/api/blog/admin/posts/9/linkedin/share'],
  ])('%s', async (_nome, run, path) => {
    expect(await urlOf(run)).toBe(`${LONG_BASE}${path}`)
  })

  it('leituras e edições simples continuam no mesmo domínio', async () => {
    expect(await urlOf(() => blogApi.admin(token, proof).list(), { posts: [] })).toBe('/api/blog/admin/posts')
  })
})
