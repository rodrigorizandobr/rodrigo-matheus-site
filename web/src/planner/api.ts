import type { PlannerParams } from './types'

/**
 * Cliente da API do simulador. As duas rotas exigem o ID token do Firebase — não
 * há leitura pública aqui, ao contrário do blog: o plano é sempre de alguém.
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type SavedPlan = { params: PlannerParams; updatedAt: string | null }
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

/**
 * `getProof` devolve a prova de que a chamada sai do site, num navegador de verdade (App Check,
 * `lib/firebase.ts`). O servidor recusa com 403 o que chegar sem ela (`api/guard/`).
 */
export const plannerApi = (getToken: TokenGetter, getProof: TokenGetter) => ({
  async getPlan(): Promise<SavedPlan> {
    return call<SavedPlan>('/api/planner/plan', await getToken(), await getProof(), 'GET')
  },
  async savePlan(patch: Partial<PlannerParams>): Promise<SavedPlan> {
    return call<SavedPlan>('/api/planner/plan', await getToken(), await getProof(), 'PUT', patch)
  },
})
