import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PARAMS } from '../../pension/types'
import { forgetSignedIn, rememberSignedIn } from '../../plan/session-hint'

const api = vi.hoisted(() => ({ getDefaults: vi.fn(), getPlan: vi.fn(), savePlan: vi.fn(), saveDefaults: vi.fn() }))
type Usuario = { email: string } | null
let currentUser: Usuario = null
let listener: ((u: Usuario) => void) | null = null

vi.mock('../../lib/firebase', () => ({
  idToken: async () => 't',
  appCheckToken: async () => 'prova',
  signInWithGoogle: vi.fn(async () => { currentUser = { email: 'eu@example.com' }; listener?.(currentUser) }),
  signOutUser: vi.fn(async () => { currentUser = null; listener?.(null) }),
  watchUser: (cb: (u: Usuario) => void) => { listener = cb; cb(currentUser); return () => { listener = null } },
}))
vi.mock('../../pension/api', () => ({ pensionApi: () => api }))

import { PensionPage } from '../PensionPage'

const PADRAO = { ...DEFAULT_PARAMS, salarioBruto: 9_000, years: 12 }
const SALVO = { ...DEFAULT_PARAMS, salarioBruto: 21_000, years: 20 }

beforeEach(() => {
  currentUser = null; listener = null
  forgetSignedIn()
  for (const f of Object.values(api)) f.mockReset()
  api.getDefaults.mockResolvedValue({ params: PADRAO, updatedAt: null, custom: true })
  api.getPlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true, isAdmin: false })
  api.savePlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true })
  api.saveDefaults.mockImplementation(async (params: unknown) => ({ params, updatedAt: null, custom: true }))
})
afterEach(() => vi.useRealTimers())

const salario = () => (screen.getByLabelText('Salário bruto') as HTMLInputElement).value

describe('previdência privada sem entrar', () => {
  it('abre direto com o formulário e o resultado, com o padrão que o administrador escolheu', async () => {
    render(<PensionPage />)
    expect(await screen.findByLabelText('Salário bruto')).toBeInTheDocument()
    expect(Number(salario())).toBe(9_000)
    expect(screen.getAllByText('Saldo líquido estimado').length).toBeGreaterThan(0)
    expect(api.getPlan).not.toHaveBeenCalled()
  })

  it('oferece salvar com o Google e não salva nada sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PensionPage />)
    expect(await screen.findByRole('button', { name: /salvar com o google/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Anos de simulação'), { target: { value: '5' } })
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('entrar com a tela intocada numa conta com plano traz o plano salvo', async () => {
    render(<PensionPage />)
    await userEvent.click(await screen.findByRole('button', { name: /salvar com o google/i }))
    await waitFor(() => expect(Number(salario())).toBe(21_000))
    expect(api.savePlan).not.toHaveBeenCalled()
  })

  it('entrar com a tela mexida numa conta com plano pergunta qual manter', async () => {
    render(<PensionPage />)
    fireEvent.change(await screen.findByLabelText('Anos de simulação'), { target: { value: '5' } })
    await userEvent.click(screen.getByRole('button', { name: /salvar com o google/i }))
    expect(await screen.findByText(/você já tem um plano salvo/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /manter o plano salvo/i }))
    await waitFor(() => expect(Number(salario())).toBe(21_000))
    expect(api.savePlan).not.toHaveBeenCalled()
  })
})

describe('previdência privada: administrador', () => {
  const comoAdmin = () => {
    currentUser = { email: 'dono@example.com' }; rememberSignedIn()
    api.getPlan.mockResolvedValue({ params: SALVO, updatedAt: null, saved: true, isAdmin: true })
  }

  it('vê o plano pessoal dele e o botão de editar os padrões; o padrão dos visitantes não é o plano dele', async () => {
    comoAdmin()
    render(<PensionPage />)
    expect(await screen.findByRole('button', { name: /editar padrões dos visitantes/i })).toBeInTheDocument()
    expect(Number(salario())).toBe(21_000)
  })

  it('editar os padrões mostra o padrão (não o plano pessoal) e salvar grava só ele', async () => {
    comoAdmin()
    render(<PensionPage />)
    await userEvent.click(await screen.findByRole('button', { name: /editar padrões dos visitantes/i }))
    await waitFor(() => expect(Number(salario())).toBe(9_000))
    fireEvent.change(screen.getByLabelText('Anos de simulação'), { target: { value: '30' } })
    await userEvent.click(screen.getByRole('button', { name: /salvar como padrão/i }))
    await waitFor(() => expect(api.saveDefaults).toHaveBeenCalledWith(expect.objectContaining({ salarioBruto: 9_000, years: 30 })))
    expect(api.savePlan).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /voltar ao meu plano/i }))
    await waitFor(() => expect(Number(salario())).toBe(21_000))
  })

  it('conta comum não vê nada de administrador', async () => {
    currentUser = { email: 'alguem@example.com' }; rememberSignedIn()
    render(<PensionPage />)
    await screen.findByLabelText('Salário bruto')
    await waitFor(() => expect(api.getPlan).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /editar padrões/i })).not.toBeInTheDocument()
  })
})
