import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// Plano curto: o diário monta uma linha por mês, e estes testes não conferem número nenhum dele.
const PLANO = { ...DEFAULT_PARAMS, years: 2 }

beforeEach(() => {
  currentUser = null
  try { window.localStorage.clear() } catch { /* sem armazenamento */ }
  api.getPlan.mockReset(); api.savePlan.mockReset()
  api.getPlan.mockResolvedValue({ params: PLANO, updatedAt: null })
  api.savePlan.mockImplementation(async (patch: Partial<typeof DEFAULT_PARAMS>) =>
    ({ params: { ...PLANO, ...patch }, updatedAt: '2026-11-11T00:00:00Z' }))
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^sair$/i })).toBeInTheDocument())
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
    // diário de bordo) — só "Renda disponível no fim" é exclusiva do cartão de resultado.
    expect(await screen.findByText('Renda disponível no fim')).toBeInTheDocument()
    expect(screen.getByText('Diário de bordo')).toBeInTheDocument()
  })

  it('mexer num slider agenda um autosave, sem salvar antes do tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    const slider = await screen.findByLabelText(/anos de simulação/i)
    fireEvent.change(slider, { target: { value: '3' } })

    expect(api.savePlan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.savePlan).toHaveBeenCalledWith(expect.objectContaining({ years: 3 }))
    vi.useRealTimers()
  })

  it('não salva de novo só por causa da carga inicial do plano', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    await screen.findByText('Renda disponível no fim')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.savePlan).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('sair chama o signOut', async () => {
    await logar()
    await userEvent.click(await screen.findByRole('button', { name: /^sair$/i }))
    expect(currentUser).toBeNull()
  })
})

describe('a tela nova', () => {
  const logar = async () => {
    currentUser = { email: 'eu@example.com' }
    render(<PlannerPage />)
    await screen.findByText('Renda disponível no fim')
  }
  const grupo = (titulo: string) => screen.getByText(titulo).closest('details') as HTMLDetailsElement

  it('mostra os seis cartões de resultado', async () => {
    await logar()
    for (const nome of ['Vive de renda a partir de', 'Renda disponível no fim', 'Patrimônio líquido no fim', 'Dívida e compromissos no fim']) {
      expect(screen.getByText(nome)).toBeInTheDocument()
    }
  })

  it('os grupos principais começam abertos e os outros fechados', async () => {
    await logar()
    for (const aberto of ['Seus aportes', 'Viver de renda', 'O studio', 'Plano investidor (contrato)']) expect(grupo(aberto).open, aberto).toBe(true)
    for (const fechado of ['Venda', 'Consórcio', 'Temporada (Airbnb)', 'Mercado']) expect(grupo(fechado).open, fechado).toBe(false)
  })

  it('o campo de um grupo fechado continua no DOM e a escolha de abrir é lembrada', async () => {
    await logar()
    expect(screen.getByLabelText(/vender nas chaves/i)).toBeInTheDocument()
    fireEvent.click(grupo('Venda').querySelector('summary')!)
    await waitFor(() => expect(window.localStorage.getItem('planner:grupo:Venda')).toBe('1'))
  })

  it('o campo de aluguel mostra a referência de mercado', async () => {
    await logar()
    expect(screen.getAllByText(/Referência:.*Centro de São Paulo/).length).toBeGreaterThan(0)
  })

  it('"Usar referências de mercado" troca aluguel, INCC e envelhecimento e dá para desfazer', async () => {
    api.getPlan.mockResolvedValue({ params: { ...PLANO, rate: 0.8 }, updatedAt: null })
    await logar()
    const aluguel = screen.getByLabelText('Aluguel bruto mensal') as HTMLInputElement
    expect(Number(aluguel.value)).toBe(0.8)
    await userEvent.click(screen.getByRole('button', { name: /usar referências de mercado/i }))
    expect(Number((screen.getByLabelText('Aluguel bruto mensal') as HTMLInputElement).value)).toBe(0.65)
    await userEvent.click(screen.getByRole('button', { name: /desfazer/i }))
    expect(Number((screen.getByLabelText('Aluguel bruto mensal') as HTMLInputElement).value)).toBe(0.8)
  })

  it('o botão da média do INCC grava a média dos últimos 2 anos', async () => {
    api.getPlan.mockResolvedValue({ params: { ...PLANO, correcaoObraAno: 3 }, updatedAt: null })
    await logar()
    await userEvent.click(screen.getByRole('button', { name: /média do INCC dos últimos 2 anos/i }))
    expect(Number((screen.getByLabelText('Correção das parcelas da obra') as HTMLInputElement).value)).toBe(6.66)
  })

  it('o resumo do contrato e o teto dos sliders respeitam os 100%', async () => {
    await logar()
    expect(screen.getByText(/Até as chaves: 70% · Depois das chaves: 30%/)).toBeInTheDocument()
    // entrada 40 + mensais 25 + reforços 15 + chaves 20 = 100: não sobra espaço para os outros subirem
    fireEvent.change(screen.getByLabelText('Entrada (no ato)'), { target: { value: '40' } })
    expect(screen.getByText(/Até as chaves: 100% · Depois das chaves: 0%/)).toBeInTheDocument()
    expect((screen.getByLabelText('Parcelas mensais até as chaves') as HTMLInputElement).max).toBe('25')
  })

  it('a chave de moeda começa em reais de hoje, muda o patrimônio e é lembrada', async () => {
    await logar()
    const valor = () => screen.getByText('Patrimônio líquido no fim').previousSibling!.textContent
    const hoje = valor()
    expect(screen.getByRole('button', { name: 'R$ de hoje' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'R$ nominais' }))
    expect(valor()).not.toBe(hoje)
    expect(window.localStorage.getItem('planner:moeda')).toBe('nominal')
  })

  it('o aviso de novidades aparece, some ao clicar em entendi e não volta', async () => {
    const primeira = render(<PlannerPage />)
    primeira.unmount()
    await logar()
    expect(screen.getByText('O simulador ficou mais realista')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'entendi' }))
    expect(screen.queryByText('O simulador ficou mais realista')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('planner:novidades')).toBeTruthy()
  })

  it('os painéis de leitura: vale parcelar, tradicional × temporada e comparar', async () => {
    await logar()
    expect(screen.getByText('Vale parcelar com a construtora?')).toBeInTheDocument()
    expect(screen.getByText('Tradicional × temporada')).toBeInTheDocument()
    expect(screen.getByText('Comparar estratégias')).toBeInTheDocument()
  })

  it('comparar só roda no clique, mostra o plano e o cenário ruim, e avisa quando os campos mudam', async () => {
    await logar()
    expect(screen.queryByText('Cenário ruim')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'comparar' }))
    expect(screen.getAllByText('Seu plano').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cenário ruim').length).toBeGreaterThan(0)
    const [desktop, celular] = screen.getAllByRole('table').filter((t) => /Estratégia/.test(t.textContent ?? ''))
    expect(within(desktop).getAllByRole('row').length).toBe(within(celular).getAllByRole('row').length)
    fireEvent.change(screen.getByLabelText(/anos de simulação/i), { target: { value: '3' } })
    expect(await screen.findByText(/os números ao lado mudaram/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'comparar de novo' })).toBeInTheDocument()
  })
})
