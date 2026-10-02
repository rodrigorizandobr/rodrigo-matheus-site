import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopicComposer } from './TopicComposer'

describe('TopicComposer — escrever sobre um tema com pesquisa na internet', () => {
  it('só habilita o botão com um tema escrito', async () => {
    render(<TopicComposer busy={false} onWrite={vi.fn()} />)
    const botao = screen.getByRole('button', { name: /pesquisar e escrever/i })
    expect(botao).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), 'RAG')
    expect(botao).toBeEnabled()
  })

  it('manda o tema sem espaços nas pontas', async () => {
    const onWrite = vi.fn()
    render(<TopicComposer busy={false} onWrite={onWrite} />)
    await userEvent.type(screen.getByRole('textbox'), '  RAG em produção  ')
    await userEvent.click(screen.getByRole('button', { name: /pesquisar e escrever/i }))
    expect(onWrite).toHaveBeenCalledWith('RAG em produção')
  })

  it('Enter no campo também escreve', async () => {
    const onWrite = vi.fn()
    render(<TopicComposer busy={false} onWrite={onWrite} />)
    await userEvent.type(screen.getByRole('textbox'), 'RAG{Enter}')
    expect(onWrite).toHaveBeenCalledWith('RAG')
  })

  it('ocupado: mostra o andamento e não deixa mandar de novo', async () => {
    render(<TopicComposer busy onWrite={vi.fn()} />)
    expect(screen.getByRole('button', { name: /pesquisando e escrevendo/i })).toBeDisabled()
  })

  it('diz com todas as letras que pesquisa na internet — é o que o distingue dos outros modos', () => {
    render(<TopicComposer busy={false} onWrite={vi.fn()} />)
    expect(screen.getByText(/pesquisa na internet/i)).toBeInTheDocument()
  })
})
