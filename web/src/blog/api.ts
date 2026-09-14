import type { BlogConfig, NewPost, Post } from './types'

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

      generate: async (topic = '', context = '') =>
        (await call<{ post: Post }>('/api/blog/admin/generate', 'POST', { topic, context })).post,
      create: async (draft: NewPost) =>
        (await call<{ post: Post }>('/api/blog/admin/posts', 'POST', draft)).post,
      update: async (id: string, patch: Partial<Post>) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}`, 'PATCH', patch)).post,
      revise: async (id: string, instruction: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/revise`, 'POST', { instruction })).post,
      cover: async (id: string, prompt?: string) =>
        (await call<{ post: Post }>(`/api/blog/admin/posts/${id}/cover`, 'POST', { prompt })).post,
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
