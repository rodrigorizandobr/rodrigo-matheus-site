import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pensionApi } from './api'

const fetchOk = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

const token = async () => 'jwt-123'
/** a prova de que a chamada sai do site, num navegador de verdade (App Check) */
const proof = async () => 'prova-123'

beforeEach(() => vi.restoreAllMocks())

describe('cliente do simulador de previdência', () => {
  it('ler o plano manda o login e a prova do navegador', async () => {
    const f = fetchOk({ params: {}, updatedAt: null })
    vi.stubGlobal('fetch', f)
    await pensionApi(token, proof).getPlan()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/pension/plan')
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
  })

  it('salvar manda o login, a prova e o plano', async () => {
    const f = fetchOk({ params: {}, updatedAt: '2026-11-19T10:00:00Z' })
    vi.stubGlobal('fetch', f)
    await pensionApi(token, proof).savePlan({ idadeAtual: 40 })
    const [, init] = f.mock.calls[0]
    expect(init.method).toBe('PUT')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
    expect(JSON.parse(init.body)).toEqual({ idadeAtual: 40 })
  })

  it('sem a prova a chamada nem sai, e o erro diz o que fazer', async () => {
    const f = fetchOk({})
    vi.stubGlobal('fetch', f)
    const semProva = async () => { throw new Error('Não deu para confirmar que este acesso vem do site.') }
    await expect(pensionApi(token, semProva).getPlan()).rejects.toThrow(/confirmar que este acesso vem do site/)
    expect(f).not.toHaveBeenCalled()
  })
})
