import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('StatPanel — módulos centrais navegáveis', () => {
  const classes = [
    { id: 'eng-manager', label: 'Engineering Manager', blurb: 'lidera times', gesture: 'Wave' },
    { id: 'ai-strategist', label: 'AI Strategist', blurb: 'estratégia de IA', gesture: 'Yes' },
    { id: 'platform-architect', label: 'Platform Architect', blurb: 'arquitetura', gesture: 'Punch' },
  ]
  const character = { name: 'Rodrigo', title: '', callsign: 'RM-2004', level: 22, stats: [], classes, skills: [] }
  const render3 = (onSelect = vi.fn()) => {
    const utils = render(<StatPanel character={character as never} activeClass={classes[0] as never} hud={en.hud} onSelect={onSelect} />)
    return { ...utils, onSelect }
  }

  it('cada módulo é um botão que anuncia se está ativo', () => {
    render3()
    const botoes = screen.getAllByRole('button')
    expect(botoes).toHaveLength(3)
    expect(botoes[0]).toHaveAttribute('aria-pressed', 'true')
    expect(botoes[1]).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicar troca a classe', async () => {
    const { onSelect } = render3()
    await userEvent.click(screen.getByRole('button', { name: /AI Strategist/i }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ai-strategist' }))
  })

  it('o efeito ativo segue no atributo que o CSS já usa', () => {
    render3()
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('data-on', 'true')
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('data-on', 'false')
  })

  it('as setas percorrem os módulos quando um deles tem o foco', async () => {
    const { onSelect } = render3()
    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ai-strategist' }))
  })

  it('a seta dá a volta no fim da lista', async () => {
    const { onSelect } = render3()
    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'platform-architect' }))
  })
})
