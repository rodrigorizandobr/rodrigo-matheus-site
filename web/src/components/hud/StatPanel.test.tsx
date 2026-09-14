import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StatPanel } from './StatPanel'
import { buildCharacter } from '../../data/character'
import en from '../../i18n/en.json'

const character = buildCharacter(en)

describe('StatPanel — a ficha à direita', () => {
  it('mostra LEVEL 22, nome e classe ativa', () => {
    render(<StatPanel character={character} activeClass={character.classes[0]} hud={en.hud} />)
    expect(screen.getByText('22')).toBeInTheDocument()
    expect(screen.getByText('LEVEL')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rodrigo Matheus' })).toBeInTheDocument()
    expect(screen.getByText('Engineering Manager')).toBeInTheDocument()
  })

  it('4 barras acessíveis com aria-valuenow = pct e label do HUD', () => {
    render(<StatPanel character={character} activeClass={character.classes[0]} hud={en.hud} />)
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(4)
    expect(bars[1]).toHaveAttribute('aria-valuenow', '80')
    expect(bars[1]).toHaveAccessibleName(/LEADERSHIP/)
  })

  it('o painel é uma região aria-live polite com o blurb da classe ativa', () => {
    render(<StatPanel character={character} activeClass={character.classes[3]} hud={en.hud} />)
    const region = screen.getByRole('region', { name: /Fintech Operator/ })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(within(region).getByText(/Banking as a Service/)).toBeInTheDocument()
  })

  it('expõe o pct como CSS var --pct para a animação da barra', () => {
    render(<StatPanel character={character} activeClass={character.classes[0]} hud={en.hud} />)
    const bar = screen.getAllByRole('progressbar')[1]
    expect(bar.style.getPropertyValue('--pct')).toBe('80')
  })
})
