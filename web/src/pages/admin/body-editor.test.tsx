import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BodyEditor } from './BodyEditor'
import type { Section } from '../../blog/types'

const sections: Section[] = [
  { heading: 'Abertura', paragraphs: ['Primeiro parágrafo.'] },
  { heading: 'Detalhe', paragraphs: ['Segundo parágrafo.'] },
]

const setup = (over: Partial<Parameters<typeof BodyEditor>[0]> = {}) => {
  const onChange = vi.fn()
  const onLang = vi.fn()
  render(<BodyEditor id="x" lang="pt" sections={sections} disabled={false} onChange={onChange} onLang={onLang} {...over} />)
  return { onChange, onLang }
}

describe('BodyEditor — tela cheia', () => {
  it('começa inline e não é um diálogo', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('## Abertura\n\nPrimeiro parágrafo.\n\n## Detalhe\n\nSegundo parágrafo.')
  })

  it('"tela cheia" abre um diálogo que traz o mesmo texto', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /tela cheia/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('Primeiro parágrafo.')
  })

  it('o que foi digitado antes de abrir a tela cheia não se perde', async () => {
    setup()
    const ta = screen.getByRole('textbox')
    await userEvent.type(ta, ' EXTRA')
    await userEvent.click(screen.getByRole('button', { name: /tela cheia/i }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('EXTRA')
  })

  it('Esc fecha e entrega as seções editadas', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('button', { name: /tela cheia/i }))
    await userEvent.type(screen.getByRole('textbox'), ' fim')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    const ultimo = onChange.mock.calls.at(-1)![0] as Section[]
    expect(ultimo[1].paragraphs[0]).toContain('fim')
  })

  it('sair da tela cheia pelo botão também entrega o texto', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('button', { name: /tela cheia/i }))
    await userEvent.type(screen.getByRole('textbox'), ' fim')
    await userEvent.click(screen.getByRole('button', { name: /sair da tela cheia/i }))
    expect(onChange).toHaveBeenCalled()
  })

  it('na tela cheia dá para trocar de idioma', async () => {
    const { onLang } = setup()
    await userEvent.click(screen.getByRole('button', { name: /tela cheia/i }))
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(onLang).toHaveBeenCalledWith('en')
  })
})

describe('BodyEditor — barra de formatação', () => {
  it('"título de seção" transforma a linha do cursor e a conversão volta como seção', async () => {
    const { onChange } = setup({ sections: [{ heading: '', paragraphs: ['Fatos do dia'] }] })
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    ta.setSelectionRange(2, 2)
    await userEvent.click(screen.getByRole('button', { name: /título de seção/i }))
    expect(ta).toHaveValue('## Fatos do dia')
    fireEvent.blur(ta)
    expect(onChange).toHaveBeenLastCalledWith([{ heading: 'Fatos do dia', paragraphs: [] }])
  })

  it('"nova seção" abre ## no cursor', async () => {
    setup({ sections: [] })
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.click(screen.getByRole('button', { name: /nova seção/i }))
    expect(ta).toHaveValue('## ')
  })

  it('mostra a contagem de palavras', () => {
    setup()
    expect(screen.getByText(/6 palavras/i)).toBeInTheDocument()
  })

  it('desabilitado, a barra não age', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button', { name: /título de seção/i })).toBeDisabled()
  })
})
