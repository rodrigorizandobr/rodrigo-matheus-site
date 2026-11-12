import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { caminhos } from '../../planner/caminhos'
import { inicioDeHoje } from '../../planner/calendario'
import { DEFAULT_PARAMS } from '../../planner/types'
import { PlannerChartEstrategias } from './PlannerChartEstrategias'
import { PlannerRoteiro } from './PlannerCaminhos'
import { PlannerAnoAno, PlannerPainel } from './PlannerPainel'
import { PlannerLedgerAbas } from './PlannerLedger'

const p = { ...DEFAULT_PARAMS, years: 6, anoTransicao: 4 }
const r = caminhos(p, inicioDeHoje())

describe('painel, ano a ano e roteiro', () => {
  it('lista as quatro estratégias, marca a melhor e deixa escolher uma', () => {
    const escolher = vi.fn()
    render(<PlannerPainel estrategias={r.estrategias} recomendada={r.recomendada} porque={r.porque} selecionada="mix" onSelecionar={escolher} ipca={4.5} anos={6} />)
    expect(screen.getByText('Onde colocar o seu dinheiro')).toBeInTheDocument()
    expect(screen.getAllByText(/★ melhor/)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^Consórcio/ }))
    expect(escolher).toHaveBeenCalledWith('consorcio')
  })
  it('o ano a ano tem uma linha por ano e uma coluna por estratégia', () => {
    render(<PlannerAnoAno estrategias={r.estrategias} recomendada={r.recomendada} ipca={4.5} />)
    expect(screen.getAllByRole('row')).toHaveLength(6 + 1)
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
  })
  it('o roteiro tem uma linha por ano', () => {
    render(<PlannerRoteiro estrategia={r.estrategias[0]} />)
    expect(screen.getAllByRole('row')).toHaveLength(6 + 1)
  })
})

describe('gráfico das quatro estratégias', () => {
  const monta = (metrica: 'renda' | 'patrimonio') => render(
    <PlannerChartEstrategias estrategias={r.estrategias} selecionada="leilao" onSelecionar={() => {}} metrica={metrica} ipca={4.5} />,
  )
  it('um gráfico por métrica, sem botão para alternar', () => {
    monta('renda')
    expect(screen.getByRole('img', { name: /Renda disponível/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Patrimônio$/ })).not.toBeInTheDocument()
    monta('patrimonio')
    expect(screen.getByRole('img', { name: /Patrimônio líquido/i })).toBeInTheDocument()
  })
  it('marca os acontecimentos da estratégia escolhida', () => {
    const { container } = monta('patrimonio')
    expect(container.querySelectorAll('svg[role="img"] title').length).toBeGreaterThan(0)
  })
})

describe('abas do diário de bordo', () => {
  it('uma aba por estratégia, e trocar de aba troca as linhas', () => {
    const escolher = vi.fn()
    render(<PlannerLedgerAbas estrategias={r.estrategias} selecionada="construtora" onSelecionar={escolher} />)
    const abas = screen.getAllByRole('tab')
    expect(abas.map((a) => a.textContent)).toEqual(['Construtora', 'Consórcio', 'Leilão', 'Mix'])
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Leilão' }))
    expect(escolher).toHaveBeenCalledWith('leilao')
  })
})
