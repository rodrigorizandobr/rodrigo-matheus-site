import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanBar, type PlanBarState } from './PlanBar'

const plano = (over: Partial<PlanBarState> = {}): PlanBarState => ({
  session: null, saveState: null, isAdmin: false, mode: 'plano', escolha: false, error: '', busy: false,
  padrao: { state: 'ocioso', sujo: false },
  login: vi.fn(), logout: vi.fn(), editarPadroes: vi.fn(), salvarPadroes: vi.fn(),
  voltarAoPlano: vi.fn(), usarFabrica: vi.fn(), manterSalvo: vi.fn(), usarTela: vi.fn(),
  ...over,
})
const logada = (over: Partial<PlanBarState> = {}) => plano({ session: { email: 'eu@example.com' }, saveState: 'salvo', ...over })
const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome })
const semBotao = (nome: RegExp | string) => expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()

describe('visitante', () => {
  it('diz que nada é salvo e oferece salvar com o Google', async () => {
    const p = plano()
    render(<PlanBar title="VIVENDO DE IMÓVEIS" plan={p} />)
    expect(screen.getByText('VIVENDO DE IMÓVEIS')).toBeInTheDocument()
    expect(screen.getByText(/nada do que você mexer é salvo/i)).toBeInTheDocument()
    await userEvent.click(botao(/salvar com o google/i))
    expect(p.login).toHaveBeenCalledTimes(1)
  })

  it('não oferece sair nem nada de administrador', () => {
    render(<PlanBar title="X" plan={plano()} />)
    semBotao(/^sair$/i)
    semBotao(/editar padrões/i)
  })

  it('enquanto a janela do Google abre, o botão fica desligado e diz o que acontece', () => {
    render(<PlanBar title="X" plan={plano({ busy: true })} />)
    expect(botao(/abrindo/i)).toBeDisabled()
  })

  it('mostra o erro em um alerta', () => {
    render(<PlanBar title="X" plan={plano({ error: 'popup fechado' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('popup fechado')
  })
})

describe('conta logada', () => {
  it('mostra o e-mail, o estado do salvamento e o botão de sair', async () => {
    const p = logada()
    render(<PlanBar title="X" plan={p} />)
    expect(screen.getByText(/eu@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/salvo/)).toBeInTheDocument()
    semBotao(/salvar com o google/i)
    await userEvent.click(botao(/^sair$/i))
    expect(p.logout).toHaveBeenCalledTimes(1)
  })

  it.each([['salvando', /salvando…/], ['erro', /erro ao salvar/]] as const)('estado %s', (saveState, texto) => {
    render(<PlanBar title="X" plan={logada({ saveState })} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('conta comum não vê nada de administrador', () => {
    render(<PlanBar title="X" plan={logada()} />)
    semBotao(/editar padrões/i)
  })
})

describe('administrador', () => {
  it('no plano pessoal: explica a diferença e oferece editar os padrões', async () => {
    const p = logada({ isAdmin: true })
    render(<PlanBar title="X" plan={p} />)
    expect(screen.getByText(/o seu plano pessoal/i)).toBeInTheDocument()
    await userEvent.click(botao(/editar padrões dos visitantes/i))
    expect(p.editarPadroes).toHaveBeenCalledTimes(1)
  })

  it('no modo padrão: deixa claro que NÃO é o plano dele e mostra as três ações', async () => {
    const p = logada({ isAdmin: true, mode: 'padrao', padrao: { state: 'ocioso', sujo: true } })
    render(<PlanBar title="X" plan={p} />)
    expect(screen.getByText(/o que todo visitante vê/i)).toBeInTheDocument()
    expect(screen.getByText(/seu plano pessoal não é alterado/i)).toBeInTheDocument()
    semBotao(/editar padrões dos visitantes/i)
    await userEvent.click(botao(/salvar como padrão/i))
    await userEvent.click(botao(/valores de fábrica/i))
    await userEvent.click(botao(/voltar ao meu plano/i))
    expect(p.salvarPadroes).toHaveBeenCalledTimes(1)
    expect(p.usarFabrica).toHaveBeenCalledTimes(1)
    expect(p.voltarAoPlano).toHaveBeenCalledTimes(1)
  })

  it('no modo padrão o estado do salvamento é o do PADRÃO, não o do plano', () => {
    render(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', saveState: 'salvo', padrao: { state: 'ocioso', sujo: true } })} />)
    expect(screen.getByText(/alterações não salvas/i)).toBeInTheDocument()
    expect(screen.queryByText(/eu@example\.com · salvo/)).not.toBeInTheDocument()
  })

  it('padrão salvo: avisa que os visitantes levam até 1 minuto para ver', () => {
    render(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', padrao: { state: 'salvo', sujo: false } })} />)
    expect(screen.getByText(/padrão salvo/i)).toBeInTheDocument()
    expect(screen.getByText(/até 1 minuto/i)).toBeInTheDocument()
  })

  it.each([['salvando', /salvando…/], ['erro', /erro ao salvar o padrão/i]] as const)('padrão %s', (state, texto) => {
    render(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', padrao: { state, sujo: true } })} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('salvar o padrão fica desligado enquanto grava e quando não há nada novo', () => {
    const { rerender } = render(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', padrao: { state: 'salvando', sujo: true } })} />)
    expect(botao(/salvar como padrão/i)).toBeDisabled()
    rerender(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', padrao: { state: 'ocioso', sujo: false } })} />)
    expect(botao(/salvar como padrão/i)).toBeDisabled()
    rerender(<PlanBar title="X" plan={logada({ isAdmin: true, mode: 'padrao', padrao: { state: 'ocioso', sujo: true } })} />)
    expect(botao(/salvar como padrão/i)).toBeEnabled()
  })
})

describe('plano salvo e tela mexida', () => {
  it('pergunta qual dos dois manter, dizendo o que cada botão faz', async () => {
    const p = logada({ escolha: true })
    render(<PlanBar title="X" plan={p} />)
    expect(screen.getByText(/você já tem um plano salvo/i)).toBeInTheDocument()
    expect(screen.getByText(/substitui o plano salvo/i)).toBeInTheDocument()
    await userEvent.click(botao(/manter o plano salvo/i))
    await userEvent.click(botao(/usar o que está na tela/i))
    expect(p.manterSalvo).toHaveBeenCalledTimes(1)
    expect(p.usarTela).toHaveBeenCalledTimes(1)
  })

  it('sem a pergunta, os botões dela não existem', () => {
    render(<PlanBar title="X" plan={logada()} />)
    semBotao(/manter o plano salvo/i)
    semBotao(/usar o que está na tela/i)
  })
})
