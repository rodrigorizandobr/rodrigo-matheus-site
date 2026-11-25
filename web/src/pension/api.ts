import type { PensionParams } from './types'

/**
 * Cliente da API do simulador (previdência). O plano é sempre de alguém: ler e gravar exigem o ID token do
 * Firebase e a prova do navegador. Os valores PADRÃO (o que um visitante vê ao abrir a página) são
 * leitura pública; gravá-los é só do administrador, e o servidor é quem confere.
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type SavedPlan = { params: PensionParams; updatedAt: string | null; saved: boolean; isAdmin: boolean }
export type Defaults = { params: PensionParams; updatedAt: string | null; custom: boolean }
export type TokenGetter = () => Promise<string>

async function call<T>(url: string, token: string, proof: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'X-Firebase-AppCheck': proof, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (cause) {
    throw new ApiError(`falha de rede: ${(cause as Error).message}`, 0)
  }
  const parsed = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((parsed as { error?: string }).error || `HTTP ${res.status}`, res.status)
  return parsed as T
}

/** Leitura pública (os valores padrão): sem login e sem prova do navegador, como a leitura dos posts. */
async function readPublic<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'GET' })
  } catch (cause) {
    throw new ApiError(`falha de rede: ${(cause as Error).message}`, 0)
  }
  const parsed = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((parsed as { error?: string }).error || `HTTP ${res.status}`, res.status)
  return parsed as T
}

/**
 * `getProof` devolve a prova de que a chamada sai do site, num navegador de verdade (App Check,
 * `lib/firebase.ts`). O servidor recusa com 403 o que chegar sem ela (`api/guard/`).
 */
export const pensionApi = (getToken: TokenGetter, getProof: TokenGetter) => ({
  async getPlan(): Promise<SavedPlan> {
    return call<SavedPlan>('/api/pension/plan', await getToken(), await getProof(), 'GET')
  },
  async savePlan(patch: Partial<PensionParams>): Promise<Omit<SavedPlan, 'isAdmin'>> {
    return call<Omit<SavedPlan, 'isAdmin'>>('/api/pension/plan', await getToken(), await getProof(), 'PUT', patch)
  },
  /** O que o visitante vê ao abrir a página. `fresh` fura a borda de 1 minuto (o administrador editando). */
  async getDefaults(fresh = false): Promise<Defaults> {
    return readPublic<Defaults>(fresh ? `/api/pension/defaults?fresh=${Date.now()}` : '/api/pension/defaults')
  },
  /** Só o administrador (o servidor confere). Substitui o padrão inteiro. */
  async saveDefaults(params: Partial<PensionParams>): Promise<Defaults> {
    return call<Defaults>('/api/pension/defaults', await getToken(), await getProof(), 'PUT', params)
  },
})
