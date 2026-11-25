import { describe, it, expect, vi, beforeEach } from 'vitest'
import { plannerApi, ApiError } from './api'

const fetchOk = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

const token = async () => 'jwt-123'
/** a prova de que a chamada sai do site, num navegador de verdade (App Check) */
const proof = async () => 'prova-123'

beforeEach(() => vi.restoreAllMocks())

describe('cliente do simulador de imóveis', () => {
  it('ler o plano manda o login e a prova do navegador', async () => {
    const f = fetchOk({ params: {}, updatedAt: null })
    vi.stubGlobal('fetch', f)
    await plannerApi(token, proof).getPlan()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/planner/plan')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
  })

  it('salvar manda o login, a prova e o plano', async () => {
    const f = fetchOk({ params: {}, updatedAt: '2026-11-19T10:00:00Z' })
    vi.stubGlobal('fetch', f)
    await plannerApi(token, proof).savePlan({ years: 20 })
    const [, init] = f.mock.calls[0]
    expect(init.method).toBe('PUT')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
    expect(JSON.parse(init.body)).toEqual({ years: 20 })
  })

  it('sem a prova a chamada nem sai, e o erro diz o que fazer', async () => {
    const f = fetchOk({})
    vi.stubGlobal('fetch', f)
    const semProva = async () => { throw new Error('Não deu para confirmar que este acesso vem do site.') }
    await expect(plannerApi(token, semProva).getPlan()).rejects.toThrow(/confirmar que este acesso vem do site/)
    expect(f).not.toHaveBeenCalled()
  })

  it('recusa da portaria (403) e limite (429) chegam com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'Muitas chamadas em pouco tempo.', code: 'rate_limit' }, 429))
    await expect(plannerApi(token, proof).savePlan({})).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/Muitas chamadas/) })
    await expect(plannerApi(token, proof).savePlan({})).rejects.toBeInstanceOf(ApiError)
  })
})

describe('valores padrão do simulador de imóveis', () => {
  it('ler o padrão é público: nem pede login nem prova do navegador', async () => {
    const f = fetchOk({ params: { years: 10 }, updatedAt: null, custom: true })
    vi.stubGlobal('fetch', f)
    const pedeToken = vi.fn(token)
    const pedeProva = vi.fn(proof)
    const padrao = await plannerApi(pedeToken, pedeProva).getDefaults()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/planner/defaults')
    expect(init?.headers?.Authorization).toBeUndefined()
    expect(init?.headers?.['X-Firebase-AppCheck']).toBeUndefined()
    expect(pedeToken).not.toHaveBeenCalled()
    expect(pedeProva).not.toHaveBeenCalled()
    expect(padrao.params).toEqual({ years: 10 })
  })

  it('ler o padrão FRESCO (para o admin editar) fura a borda com um parâmetro novo a cada chamada', async () => {
    const f = fetchOk({ params: {}, updatedAt: null, custom: false })
    vi.stubGlobal('fetch', f)
    await plannerApi(token, proof).getDefaults(true)
    expect(f.mock.calls[0][0]).toMatch(/^\/api\/planner\/defaults\?fresh=\d+$/)
  })

  it('gravar o padrão manda login, prova e a tela inteira, por PUT', async () => {
    const f = fetchOk({ params: { years: 7 }, updatedAt: '2026-11-25T10:00:00Z', custom: true })
    vi.stubGlobal('fetch', f)
    await plannerApi(token, proof).saveDefaults({ years: 7 } as never)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/planner/defaults')
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
    expect(JSON.parse(init.body)).toEqual({ years: 7 })
  })

  it('conta que não é admin recebe o 403 com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', fetchOk({ error: 'só o administrador define os valores padrão' }, 403))
    await expect(plannerApi(token, proof).saveDefaults({} as never)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/administrador/) })
  })
})
