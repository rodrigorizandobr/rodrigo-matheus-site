import type { PlannerParams } from './types'

/**
 * Cliente da API do simulador (imóveis). O plano é sempre de alguém: ler e gravar exigem o ID token do
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

export type SavedPlan = { params: PlannerParams; updatedAt: string | null; saved: boolean; isAdmin: boolean }
export type Defaults = { params: PlannerParams; updatedAt: string | null; custom: boolean }
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
export const plannerApi = (getToken: TokenGetter, getProof: TokenGetter) => ({
  async getPlan(): Promise<SavedPlan> {
    return call<SavedPlan>('/api/planner/plan', await getToken(), await getProof(), 'GET')
  },
  async savePlan(patch: Partial<PlannerParams>): Promise<Omit<SavedPlan, 'isAdmin'>> {
    return call<Omit<SavedPlan, 'isAdmin'>>('/api/planner/plan', await getToken(), await getProof(), 'PUT', patch)
  },
  /** O que o visitante vê ao abrir a página. `fresh` fura a borda de 1 minuto (o administrador editando). */
  async getDefaults(fresh = false): Promise<Defaults> {
    return readPublic<Defaults>(fresh ? `/api/planner/defaults?fresh=${Date.now()}` : '/api/planner/defaults')
  },
  /** Só o administrador (o servidor confere). Substitui o padrão inteiro. */
  async saveDefaults(params: Partial<PlannerParams>): Promise<Defaults> {
    return call<Defaults>('/api/planner/defaults', await getToken(), await getProof(), 'PUT', params)
  },
})
