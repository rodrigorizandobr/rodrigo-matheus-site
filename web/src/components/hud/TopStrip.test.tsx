import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TopStrip } from './TopStrip'
import en from '../../i18n/en.json'
import { resetArenaCache } from '../../hooks/useArena'

beforeEach(() => resetArenaCache())
afterEach(() => vi.unstubAllGlobals())

const ok = (repos: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ repos }), { status: 200 }))

describe('TopStrip — cromo de jogo com números reais do GitHub', () => {
  it('antes da resposta mostra — e SYNCING', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<TopStrip hud={en.hud} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('SYNCING')).toBeInTheDocument()
  })

  it('com a API online mostra repos e commits de 28d e o LINK fica ONLINE', async () => {
    vi.stubGlobal('fetch', ok([
      { sparkline: { days: [], commits: 100 }, stargazers_count: 0 },
      { sparkline: { days: [], commits: 9 }, stargazers_count: 0 },
    ]))
    render(<TopStrip hud={en.hud} />)
    await waitFor(() => expect(screen.getByText('ONLINE')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('109')).toBeInTheDocument())
  })

  it('API fora → OFFLINE, sem quebrar o hero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    render(<TopStrip hud={en.hud} />)
    await waitFor(() => expect(screen.getByText('OFFLINE')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveAccessibleName(/LINK: OFFLINE/)
  })
})
