import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchArena, summarize } from './api'
import type { Repo } from './repos'

const repo = (over: Partial<Repo> = {}): Repo => ({
  name: 'r', html_url: '', description: '', language: 'Python', topics: [], stargazers_count: 0, forks_count: 0,
  pushed_at: '2026-04-16T08:34:00Z', sparkline: { days: new Array(28).fill(0), commits: 0 }, commits: [], ...over,
})

afterEach(() => vi.unstubAllGlobals())

describe('summarize — os agregados que a barra superior mostra', () => {
  it('conta repos, soma commits de 28d e estrelas', () => {
    const s = summarize([repo({ sparkline: { days: [], commits: 5 }, stargazers_count: 2 }), repo({ sparkline: null, stargazers_count: 10 })])
    expect(s).toEqual({ repos: 2, commits28d: 5, stars: 12 })
  })
  it('lista vazia → zeros', () => {
    expect(summarize([])).toEqual({ repos: 0, commits28d: 0, stars: 0 })
  })
})

describe('fetchArena — /api/data com timeout, tolerante a payload parcial', () => {
  it('200 → repos; ignora o campo i18n do payload (ADR-10)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ i18n: { pt: {} }, repos: [repo()] }), { status: 200 })))
    const r = await fetchArena()
    expect(r.status).toBe('online')
    expect(r.repos).toHaveLength(1)
  })
  it('500 → offline, sem throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    await expect(fetchArena()).resolves.toEqual({ status: 'offline', repos: [] })
  })
  it('rede caiu → offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(fetchArena()).resolves.toEqual({ status: 'offline', repos: [] })
  })
  it('estoura o timeout → offline (AbortController)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_: string, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })))
    const p = fetchArena(50)
    await vi.advanceTimersByTimeAsync(60)
    await expect(p).resolves.toEqual({ status: 'offline', repos: [] })
    vi.useRealTimers()
  })
  it('payload sem repos → online com lista vazia (não quebra o hero)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    await expect(fetchArena()).resolves.toEqual({ status: 'online', repos: [] })
  })
})
