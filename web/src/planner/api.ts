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

async function call<T>(url: string, token: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (cause) {
    throw new ApiError(`falha de rede: ${(cause as Error).message}`, 0)
  }
  const parsed = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((parsed as { error?: string }).error || `HTTP ${res.status}`, res.status)
  return parsed as T
}

export const plannerApi = (getToken: TokenGetter) => ({
  async getPlan(): Promise<SavedPlan> {
    return call<SavedPlan>('/api/planner/plan', await getToken(), 'GET')
  },
  async savePlan(patch: Partial<PlannerParams>): Promise<SavedPlan> {
    return call<SavedPlan>('/api/planner/plan', await getToken(), 'PUT', patch)
  },
})
