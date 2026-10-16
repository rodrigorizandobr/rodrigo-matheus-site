import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReflectionComposer } from './ReflectionComposer'

describe('ReflectionComposer — reflexão sem notícia, tema opcional', () => {
  it('o botão já nasce habilitado: tema vazio gira entre os cadastrados', () => {
    render(<ReflectionComposer busy={false} onWrite={vi.fn()} />)
    expect(screen.getByRole('button', { name: /escrever reflexão/i })).toBeEnabled()
  })

  it('tema vazio manda string vazia, com capa por padrão — quem decide o rodízio é o servidor', async () => {
    const onWrite = vi.fn()
    render(<ReflectionComposer busy={false} onWrite={onWrite} />)
    await userEvent.click(screen.getByRole('button', { name: /escrever reflexão/i }))
    expect(onWrite).toHaveBeenCalledWith('', true)
  })

  it('manda o tema digitado, sem espaços nas pontas', async () => {
    const onWrite = vi.fn()
    render(<ReflectionComposer busy={false} onWrite={onWrite} />)
    await userEvent.type(screen.getByRole('textbox'), '  contratar sênior  ')
    await userEvent.click(screen.getByRole('button', { name: /escrever reflexão/i }))
    expect(onWrite).toHaveBeenCalledWith('contratar sênior', true)
  })

  it('Enter no campo também escreve', async () => {
    const onWrite = vi.fn()
    render(<ReflectionComposer busy={false} onWrite={onWrite} />)
    await userEvent.type(screen.getByRole('textbox'), 'contratar sênior{Enter}')
    expect(onWrite).toHaveBeenCalledWith('contratar sênior', true)
  })

  it('ocupado: mostra o andamento e não deixa mandar de novo', () => {
    render(<ReflectionComposer busy onWrite={vi.fn()} />)
    expect(screen.getByRole('button', { name: /escrevendo/i })).toBeDisabled()
  })

  it('diz que não é notícia — é o que distingue dos outros modos', () => {
    render(<ReflectionComposer busy={false} onWrite={vi.fn()} />)
    expect(screen.getByText(/sem notícia/i)).toBeInTheDocument()
  })

  it('desmarcando "com capa" manda withImage falso — post só texto, como o Ricardo Amorim também posta', async () => {
    const onWrite = vi.fn()
    render(<ReflectionComposer busy={false} onWrite={onWrite} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /com capa/i }))
    await userEvent.click(screen.getByRole('button', { name: /escrever reflexão/i }))
    expect(onWrite).toHaveBeenCalledWith('', false)
  })

  it('a capa vem marcada por padrão', () => {
    render(<ReflectionComposer busy={false} onWrite={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: /com capa/i })).toBeChecked()
  })
})
