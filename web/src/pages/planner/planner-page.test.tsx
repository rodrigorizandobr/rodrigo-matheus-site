import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PARAMS } from '../../planner/types'

const api = vi.hoisted(() => ({ getPlan: vi.fn(), savePlan: vi.fn() }))
let currentUser: { email: string } | null = null

vi.mock('../../lib/firebase', () => ({
  idToken: async () => 't',
  signInWithGoogle: vi.fn(async () => { currentUser = { email: 'eu@example.com' }; notify() }),
  signOutUser: vi.fn(async () => { currentUser = null; notify() }),
  watchUser: (cb: (u: { email: string } | null) => void) => { listener = cb; cb(currentUser); return () => { listener = null } },
}))
vi.mock('../../planner/api', () => ({ plannerApi: () => api }))

let listener: ((u: { email: string } | null) => void) | null = null
const notify = () => listener?.(currentUser)

import { PlannerPage } from '../PlannerPage'

beforeEach(() => {
  currentUser = null
  api.getPlan.mockReset(); api.savePlan.mockReset()
  api.getPlan.mockResolvedValue({ params: DEFAULT_PARAMS, updatedAt: null })
  api.savePlan.mockImplementation(async (patch: Partial<typeof DEFAULT_PARAMS>) =>
    ({ params: { ...DEFAULT_PARAMS, ...patch }, updatedAt: '2026-11-11T00:00:00Z' }))
})
afterEach(() => vi.restoreAllMocks())

describe('portão de login', () => {
  it('mostra o botão de entrar quando deslogado', async () => {
    render(<PlannerPage />)
    expect(await screen.findByRole('button', { name: /entrar com google/i })).toBeInTheDocument()
  })

  it('clicar em entrar chama o login do Google', async () => {
    render(<PlannerPage />)
    await userEvent.click(await screen.findByRole('button', { name: /entrar com google/i }))
    await waitFor(() => expect(screen.getByText(/sair/i)).toBeInTheDocument())
  })
})

describe('depois de logado', () => {
  const logar = async () => {
    currentUser = { email: 'eu@example.com' }
    render(<PlannerPage />)
    await waitFor(() => expect(api.getPlan).toHaveBeenCalled())
  }

  it('carrega o plano e mostra os cartões de resultado', async () => {
    await logar()
    // "Studios c/ chaves"/"Studios quitados" também são cabeçalho de tabela (gráfico e
    // diário de bordo) — só "Renda mensal líquida" é exclusiva do cartão de resultado.
    expect(await screen.findByText('Renda mensal líquida')).toBeInTheDocument()
    expect(screen.getByText('Diário de bordo')).toBeInTheDocument()
  })

  it('mexer num slider agenda um autosave, sem salvar antes do tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    const slider = await screen.findByLabelText(/anos de simulação/i)
    fireEvent.change(slider, { target: { value: '20' } })

    expect(api.savePlan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.savePlan).toHaveBeenCalledWith(expect.objectContaining({ years: 20 }))
    vi.useRealTimers()
  })

  it('não salva de novo só por causa da carga inicial do plano', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    await screen.findByText('Renda mensal líquida')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.savePlan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('sair chama o signOut', async () => {
    await logar()
    await userEvent.click(await screen.findByText(/sair/i))
    expect(currentUser).toBeNull()
  })
})
