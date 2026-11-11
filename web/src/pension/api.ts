import type { PensionParams } from './types'

/**
 * Cliente da API do simulador de previdência. Mesmo contrato do `plannerApi`
 * (ID token do Firebase, um plano por uid) — rotas diferentes, mesma portaria
 * no backend (`api/pension/`).
 */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type SavedPlan = { params: PensionParams; updatedAt: string | null }
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

export const pensionApi = (getToken: TokenGetter) => ({
  async getPlan(): Promise<SavedPlan> {
    return call<SavedPlan>('/api/pension/plan', await getToken(), 'GET')
  },
  async savePlan(patch: Partial<PensionParams>): Promise<SavedPlan> {
    return call<SavedPlan>('/api/pension/plan', await getToken(), 'PUT', patch)
  },
})
