import type { BlogConfig, LinkedInStatus, MediaItem, NewPost, Post, StockResult } from './types'

/**
 * Cliente da API do blog. Leitura é pública; escrita passa pelo painel e vai
 * sempre com o ID token do Firebase no header — o token é buscado a cada
 * chamada (`getToken`) porque ele expira em uma hora e o SDK renova sozinho.
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (cause) {
    throw new ApiError(`falha de rede: ${(cause as Error).message}`, 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((body as { error?: string }).error || `HTTP ${res.status}`, res.status)
  return body as T
}

const json = (method: string, token: string, body?: unknown): RequestInit => ({
  method,
  headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export type TokenGetter = () => Promise<string>

export const blogApi = {
  async list(): Promise<Post[]> {
    return (await request<{ posts: Post[] }>('/api/blog/posts')).posts
  },

  /** `null` (e não erro) quando o slug não existe: a página mostra "post não encontrado". */
  async get(slug: string): Promise<Post | null> {
    try {
      return (await request<{ post: Post }>(`/api/blog/posts/${encodeURIComponent(slug)}`)).post
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  admin(getToken: TokenGetter) {
    const call = async <T>(url: string, method = 'GET', body?: unknown): Promise<T> =>
      request<T>(url, json(method, await getToken(), body))

    return {
      list: async () => (await call<{ posts: Post[] }>('/api/blog/admin/posts')).posts,
      config: async () => (await call<{ config: BlogConfig }>('/api/blog/admin/config')).config,
      saveConfig: async (patch: Partial<BlogConfig>) =>
        (await call<{ config: BlogConfig }>('/api/blog/admin/config', 'PATCH', patch)).config,

      generate: async (topic = '', research?: boolean) =>
        (await call<{ post: Post }>('/api/blog/admin/generate', 'POST', { topic, context: '', research })).post,
      create: async (draft: NewPost) =>
        (await call<{ post: Post }>('/api/blog/admin/posts', 'POST', draft)).post,
      update: async (id: string, patch: Partial<Post>) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}`, 'PATCH', patch)).post,
      revise: async (id: string, instruction: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/revise`, 'POST', { instruction })).post,
      /** gera uma capa nova com IA a partir de um prompt */
      cover: async (id: string, prompt?: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/cover`, 'POST', { prompt })).post,
      /** escolhe uma imagem já catalogada — `null` tira a capa */
      setCover: async (id: string, hash: string | null) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/cover`, 'POST', { hash })).post,

      linkedin: {
        status: async () => call<LinkedInStatus>('/api/blog/admin/linkedin'),
        /** devolve a URL de autorização; a janela do navegador vai para lá */
        connect: async () => (await call<{ url: string }>('/api/blog/admin/linkedin/connect', 'POST')).url,
        disconnect: async () => call<{ ok: boolean }>('/api/blog/admin/linkedin/disconnect', 'POST'),
        saveApp: async (clientId: string, clientSecret: string) =>
          call<LinkedInStatus>('/api/blog/admin/linkedin/app', 'POST', { clientId, clientSecret }),
        /** manda o próximo da fila agora; `null` quando a fila está vazia */
        shareNow: async () => (await call<{ post: Post | null }>('/api/blog/admin/linkedin/share', 'POST')).post,
      },

      media: {
        list: async () => (await call<{ items: MediaItem[] }>('/api/blog/admin/media')).items,
        generate: async (prompt: string, alt = '') =>
          (await call<{ item: MediaItem }>('/api/blog/admin/media/generate', 'POST', { prompt, alt })).item,
        searchStock: async (q: string) =>
          (await call<{ results: StockResult[] }>(`/api/blog/admin/media/stock?q=${encodeURIComponent(q)}`)).results,
        importStock: async (r: StockResult, alt = '') =>
          (await call<{ item: MediaItem }>('/api/blog/admin/media/stock', 'POST',
            { url: r.url, credit: r.credit, sourceUrl: r.sourceUrl, alt })).item,
        update: async (hash: string, patch: Partial<Pick<MediaItem, 'alt' | 'credit' | 'sourceUrl'>>) =>
          (await call<{ item: MediaItem }>(`/api/blog/admin/media/${hash}`, 'PATCH', patch)).item,
        remove: async (hash: string) => call<{ ok: boolean }>(`/api/blog/admin/media/${hash}`, 'DELETE'),
        /** upload é multipart: não passa pelo helper JSON */
        upload: async (file: File, alt = ''): Promise<MediaItem> => {
          const form = new FormData()
          form.append('file', file)
          form.append('alt', alt)
          const res = await fetch('/api/blog/admin/media/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${await getToken()}` },
            body: form,
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) throw new ApiError((body as { error?: string }).error || `HTTP ${res.status}`, res.status)
          return (body as { item: MediaItem }).item
        },
      },
      publish: async (id: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/publish`, 'POST')).post,
      unpublish: async (id: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/unpublish`, 'POST')).post,
      schedule: async (id: string, when: Date) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/schedule`, 'POST', { when: when.toISOString() })).post,
      remove: async (id: string) => call<{ ok: boolean }>(`/api/blog/admin/posts/${id}`, 'DELETE'),
    }
  },
}
