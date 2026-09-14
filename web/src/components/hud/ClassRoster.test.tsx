import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ClassRoster } from './ClassRoster'
import { buildCharacter, type CharacterClass } from '../../data/character'
import en from '../../i18n/en.json'

const { classes } = buildCharacter(en)

function Harness({ onSelect = vi.fn() }: { onSelect?: (c: CharacterClass) => void }) {
  const [active, setActive] = useState(classes[0].id)
  return (
    <ClassRoster
      classes={classes}
      activeId={active}
      hud={en.hud}
      onSelect={(c) => { setActive(c.id); onSelect(c) }}
    />
  )
}

describe('ClassRoster — roster à esquerda', () => {
  it('é uma nav "CLASSES S — A" com 4 botões, o primeiro pressionado', () => {
    render(<Harness />)
    expect(screen.getByRole('navigation', { name: /CLASSES S — A/ })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicar troca a classe ativa, chama onSelect e dispara GA class_select', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /AI Strategist/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ai-strategist' }))
    expect(screen.getByRole('button', { name: /AI Strategist/ })).toHaveAttribute('aria-pressed', 'true')
    expect(window.gtag).toHaveBeenCalledWith('event', 'class_select', { class: 'ai-strategist', language: 'en' })
  })

  it('setas ← → navegam e selecionam, com wrap', async () => {
    render(<Harness />)
    const buttons = screen.getAllByRole('button')
    buttons[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(buttons[1]).toHaveFocus()
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(buttons[3]).toHaveFocus()
    expect(buttons[3]).toHaveAttribute('aria-pressed', 'true')
  })

  it('marca a classe ativa com o badge ACTIVE', () => {
    render(<Harness />)
    const active = screen.getByRole('button', { pressed: true })
    expect(active).toHaveTextContent('ACTIVE')
  })
})
