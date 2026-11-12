import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PlannerChart } from './PlannerChart'
import type { YearPoint } from '../../planner/types'

const ponto = (ano: number, patrimonio: number): YearPoint => ({
  ano, anoCalendario: 2026 + ano, patrimonioLiquido: patrimonio, precoStudioNovo: 260_000, studiosComChaves: ano,
  studiosQuitadosEquiv: 0, rendaMensalLiquida: ano * 1_000, divida: ano * 10_000,
})
const pontos = [ponto(0, 75_000), ponto(1, 200_000), ponto(2, 400_000)]
const bench = [75_000, 180_000, 300_000]

describe('PlannerChart', () => {
  it('desenha as duas séries com legenda e nunca só por cor (um traço tracejado)', () => {
    const { container } = render(<PlannerChart points={pontos} benchmark={bench} />)
    expect(screen.getAllByText('Seu plano em imóveis').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mesmos aportes na renda fixa').length).toBeGreaterThan(0)
    const caminhos = container.querySelectorAll('svg[role="img"] path[fill="none"]')
    expect(caminhos).toHaveLength(2)
    expect([...caminhos].some((c) => c.getAttribute('stroke-dasharray'))).toBe(true)
  })
  it('sem rendimento a segunda série se chama total aportado', () => {
    render(<PlannerChart points={pontos} benchmark={bench} nomeBenchmark="Total aportado" />)
    expect(screen.getAllByText('Total aportado').length).toBeGreaterThan(0)
  })
  it('o texto de acessibilidade diz a moeda', () => {
    const { rerender } = render(<PlannerChart points={pontos} benchmark={bench} moeda="hoje" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/reais de hoje/)
    rerender(<PlannerChart points={pontos} benchmark={bench} moeda="nominal" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/nominais/)
  })
  it('a tabela ano a ano traz o ano civil, a renda fixa e a dívida', () => {
    render(<PlannerChart points={pontos} benchmark={bench} />)
    const tabela = screen.getByRole('table')
    const cabecalhos = within(tabela).getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toEqual(expect.arrayContaining(['Renda fixa', 'Dívida']))
    expect(within(tabela).getAllByRole('row')[2].textContent).toContain('1 · 2027')
  })
})
