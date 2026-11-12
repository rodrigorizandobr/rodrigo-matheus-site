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

// A tela roda as quatro estratégias a cada mudança de campo: no jsdom isso leva segundos.
vi.setConfig({ testTimeout: 90_000 })

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
        expect(await screen.findByText('Onde colocar o seu dinheiro')).toBeInTheDocument()
    expect(screen.getByText('Diário de bordo')).toBeInTheDocument()
  })

  it('mexer num slider agenda um autosave, sem salvar antes do tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    const slider = await screen.findByLabelText(/anos acumulando bens/i)
    fireEvent.change(slider, { target: { value: '3' } })

    expect(api.savePlan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.savePlan).toHaveBeenCalledWith(expect.objectContaining({ years: 3 }))
    vi.useRealTimers()
  })

  it('não salva de novo só por causa da carga inicial do plano', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await logar()
    await screen.findByText('Onde colocar o seu dinheiro')
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
    await screen.findByText('Onde colocar o seu dinheiro')
  }
  const grupo = (titulo: string) =>
    screen.getAllByText(titulo).find((e) => e.classList.contains('hud-label') && e.closest('summary'))!.closest('details') as HTMLDetailsElement

  it('mostra a resposta e as quatro estratégias lado a lado, sem alternar nada', async () => {
    await logar()
    const painel = screen.getByRole('region', { name: 'Resultado' })
    for (const nome of ['Construtora', 'Consórcio', 'Leilão', 'Mix']) expect(within(painel).getAllByText(nome).length).toBeGreaterThan(0)
    for (const rotulo of ['Imóveis no fim', 'Aluguel por mês', 'Gastos por mês', 'Renda por mês', 'Patrimônio']) {
      expect(within(painel).getAllByText(rotulo)).toHaveLength(4)
    }
    expect(screen.getAllByText(/nominal/).length).toBeGreaterThanOrEqual(8)
    expect(screen.getAllByRole('img', { name: /Renda disponível|Patrimônio líquido/ })).toHaveLength(2)
    for (const fora of ['R$ nominais', 'Valores em', 'Vive de renda a partir de', 'entendi']) expect(screen.queryByText(fora)).not.toBeInTheDocument()
  })

  it('os grupos principais começam abertos e os outros fechados', async () => {
    await logar()
    for (const aberto of ['Seus dados', 'Seu apê (FGTS)']) expect(grupo(aberto).open, aberto).toBe(true)
    for (const fechado of ['Studio que você já paga', 'O studio', 'Plano investidor (contrato)', 'Venda', 'Consórcio', 'Temporada (Airbnb)', 'Mercado']) expect(grupo(fechado).open, fechado).toBe(false)
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

  it('só o automático: sem escolha de parcelamento, índice, reserva, sobra do caixa nem quem paga IPTU/condomínio', async () => {
    await logar()
    expect(screen.getByLabelText('Parcelado até as chaves (mensais + reforços)')).toBeInTheDocument()
    for (const rotulo of ['Parcelas mensais até as chaves', 'Reforços periódicos', 'Correção depois das chaves (IPCA)', 'Correção das parcelas da obra', 'Reserva mínima no caixa']) {
      expect(screen.queryByLabelText(rotulo), rotulo).not.toBeInTheDocument()
    }
    for (const texto of ['Manual', 'Índice da obra', 'Quem paga o IPTU', 'Quem paga o condomínio', 'Dinheiro que sobra', 'Viver de renda', 'Salário líquido do casal (CLT)', 'Despesas mensais']) {
      expect(screen.queryByText(texto, { exact: false }), texto).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Sua margem livre')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Parcela mensal')).toBeInTheDocument()
  })

  it('o sistema decide temporada e consórcio; a diária é % do imóvel, o lance mínimo é 40% e o leilão nasce em 38%', async () => {
    await logar()
    expect(screen.queryByLabelText('Parte da carteira em temporada')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cotas de consórcio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Meta')).not.toBeInTheDocument()
    expect(screen.queryByText(/Quanto você quer por mês/)).not.toBeInTheDocument()
    const diaria = screen.getByLabelText('Diária média') as HTMLInputElement
    expect([diaria.min, diaria.max]).toEqual(['0.02', '0.3'])
    expect((screen.getByLabelText('Lance') as HTMLInputElement).min).toBe('40')
    expect(Number((screen.getByLabelText('Desconto sobre o valor de mercado') as HTMLInputElement).value)).toBe(38)
  })

  it('o aporte anual é em salários CLT e o prazo é o tempo acumulando bens', async () => {
    await logar()
    const anual = screen.getByLabelText('Aporte por ano (em salários)') as HTMLInputElement
    expect([anual.min, anual.max, anual.step]).toEqual(['0', '12', '0.5'])
    expect(screen.getByText(/Hoje: .* por ano/)).toBeInTheDocument()
    expect(screen.getByLabelText('Anos acumulando bens')).toBeInTheDocument()
    expect(screen.queryByLabelText('Aporte anual')).not.toBeInTheDocument()
  })

  it('o resumo do contrato e o teto dos sliders respeitam os 100%', async () => {
    await logar()
    expect(screen.getByText(/Até as chaves: 70% · Depois das chaves: 30%/)).toBeInTheDocument()
    // entrada 40 + mensais 25 + reforços 15 + chaves 20 = 100: não sobra espaço para os outros subirem
    fireEvent.change(screen.getByLabelText('Entrada (no ato)'), { target: { value: '40' } })
    expect(screen.getByText(/Até as chaves: 100% · Depois das chaves: 0%/)).toBeInTheDocument()
    expect((screen.getByLabelText('Parcelado até as chaves (mensais + reforços)') as HTMLInputElement).max).toBe('40')
  })

  it('os painéis de leitura: vale parcelar, tradicional × temporada e comparar', async () => {
    await logar()
    await userEvent.click(within(screen.getByRole('region', { name: 'Resultado' })).getByRole('button', { name: /^Construtora/ })) // o painel só vale para quem compra na planta
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
    const [desktop, celular] = screen.getAllByRole('table').filter((t) => /Seu plano/.test(t.textContent ?? ''))
    expect(within(desktop).getAllByRole('row').length).toBe(within(celular).getAllByRole('row').length)
    fireEvent.change(screen.getByLabelText(/anos acumulando bens/i), { target: { value: '3' } })
    expect(await screen.findByText(/os números ao lado mudaram/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'comparar de novo' })).toBeInTheDocument()
  })
})
