import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { caminhos } from '../../planner/caminhos'
import { inicioDeHoje } from '../../planner/calendario'
import { DEFAULT_PARAMS } from '../../planner/types'
import { PlannerChartEstrategias } from './PlannerChartEstrategias'
import { PlannerRecomendacao, PlannerRoteiro } from './PlannerCaminhos'
import { PlannerLedgerAbas } from './PlannerLedger'

const p = { ...DEFAULT_PARAMS, years: 6, anoTransicao: 4 }
const r = caminhos(p, inicioDeHoje())
const conv = (v: number) => v

describe('recomendação e roteiro', () => {
  it('lista as quatro estratégias e marca a recomendada', () => {
    const escolher = vi.fn()
    render(<PlannerRecomendacao estrategias={r.estrategias} recomendada={r.recomendada} porque={r.porque} selecionada="mix" onSelecionar={escolher} anos={6} metaHoje={15_000} />)
    for (const nome of ['Construtora', 'Consórcio', 'Leilão', 'Mix']) expect(screen.getAllByText(new RegExp(nome)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Consórcio/ }))
    expect(escolher).toHaveBeenCalledWith('consorcio')
  })
  it('o roteiro tem uma linha por ano', () => {
    render(<PlannerRoteiro estrategia={r.estrategias[0]} />)
    expect(screen.getAllByRole('row')).toHaveLength(6 + 1)
  })
})

describe('gráfico das quatro estratégias', () => {
  const monta = () => render(
    <PlannerChartEstrategias estrategias={r.estrategias} selecionada="leilao" onSelecionar={() => {}} conv={conv}
                             benchmark={r.estrategias[0].linhas.map(() => 1000)} nomeBenchmark="Total aportado" metaDoMes={() => 15_000} moeda="hoje" />,
  )
  it('tem uma linha de legenda por estratégia e alterna renda e patrimônio', () => {
    monta()
    expect(screen.getByRole('img', { name: /Renda disponível/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Patrimônio$/ }))
    expect(screen.getByRole('img', { name: /Patrimônio líquido/i })).toBeInTheDocument()
  })
  it('marca os acontecimentos da estratégia escolhida e dá para desligar', () => {
    const { container } = monta()
    const antes = container.querySelectorAll('svg[role="img"] title').length
    expect(antes).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText(/marcar acontecimentos/i))
    expect(container.querySelectorAll('svg[role="img"] title').length).toBe(0)
  })
  it('lista os acontecimentos em texto', () => {
    monta()
    expect(screen.getByText(/Acontecimentos de Leilão/)).toBeInTheDocument()
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
