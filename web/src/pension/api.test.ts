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

describe('valores padrão do simulador de previdência', () => {
  it('ler o padrão é público: nem pede login nem prova do navegador', async () => {
    const f = fetchOk({ params: { idadeAtual: 30 }, updatedAt: null, custom: true })
    vi.stubGlobal('fetch', f)
    const pedeToken = vi.fn(token)
    const pedeProva = vi.fn(proof)
    const padrao = await pensionApi(pedeToken, pedeProva).getDefaults()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/pension/defaults')
    expect(init?.headers?.Authorization).toBeUndefined()
    expect(init?.headers?.['X-Firebase-AppCheck']).toBeUndefined()
    expect(pedeToken).not.toHaveBeenCalled()
    expect(pedeProva).not.toHaveBeenCalled()
    expect(padrao.params).toEqual({ idadeAtual: 30 })
  })

  it('ler o padrão FRESCO fura a borda com um parâmetro novo', async () => {
    const f = fetchOk({ params: {}, updatedAt: null, custom: false })
    vi.stubGlobal('fetch', f)
    await pensionApi(token, proof).getDefaults(true)
    expect(f.mock.calls[0][0]).toMatch(/^\/api\/pension\/defaults\?fresh=\d+$/)
  })

  it('gravar o padrão manda login, prova e a tela inteira, por PUT', async () => {
    const f = fetchOk({ params: { idadeAtual: 33 }, updatedAt: '2026-11-25T10:00:00Z', custom: true })
    vi.stubGlobal('fetch', f)
    await pensionApi(token, proof).saveDefaults({ idadeAtual: 33 } as never)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/pension/defaults')
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(init.headers['X-Firebase-AppCheck']).toBe('prova-123')
    expect(JSON.parse(init.body)).toEqual({ idadeAtual: 33 })
  })
})
