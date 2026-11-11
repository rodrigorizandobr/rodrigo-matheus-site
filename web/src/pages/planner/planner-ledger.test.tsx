import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PlannerLedger } from './PlannerLedger'
import type { MonthRow } from '../../planner/types'

const linha = (over: Partial<MonthRow> = {}): MonthRow => ({
  mes: 1, anoDoPlano: 1, mesDoAno: 1, aporteMensal: 2_000, aporteAnual: 0,
  abatimentoApeFgts: 0, compraAVistaFgts: 0, saldoFgts: 0,
  imoveisEmConstrucao: 0, imoveisAlugados: 0, imoveisQuitados: 0, imoveisFinanciados: 0,
  totalImoveis: 0, totalParcelasFinanciamento: 0, rendaMensalLiquida: 0, patrimonioLiquido: 75_000,
  ...over,
})

describe('PlannerLedger — diário de bordo mês a mês', () => {
  it('uma linha de tabela por mês', () => {
    render(<PlannerLedger linhas={[linha({ mes: 1 }), linha({ mes: 2, anoDoPlano: 1, mesDoAno: 2 })]} />)
    expect(screen.getAllByRole('row')).toHaveLength(3) // cabeçalho + 2 meses
  })

  it('mostra o aporte anual só quando ele cai naquele mês', () => {
    render(<PlannerLedger linhas={[
      linha({ mes: 1, aporteAnual: 0 }),
      linha({ mes: 12, mesDoAno: 12, aporteAnual: 96_000 }),
    ]} />)
    const linhas = screen.getAllByRole('row')
    expect(within(linhas[2]).getByText(/R\$\s?96\.000/)).toBeInTheDocument()
  })

  it('mostra as amortizações, compras à vista e o saldo do FGTS', () => {
    render(<PlannerLedger linhas={[linha({
      abatimentoApeFgts: 50_000, compraAVistaFgts: 0, saldoFgts: 12_345,
    })]} />)
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText(/R\$\s?50\.000/)).toBeInTheDocument()
    expect(within(row).getByText(/R\$\s?12\.345/)).toBeInTheDocument()
  })

  it('mostra a contagem de imóveis por status', () => {
    render(<PlannerLedger linhas={[linha({
      imoveisEmConstrucao: 2, imoveisAlugados: 3, imoveisQuitados: 1, imoveisFinanciados: 2, totalImoveis: 5,
    })]} />)
    const row = screen.getAllByRole('row')[1]
    const cols = within(row).getAllByRole('cell')
    expect(cols.map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['2', '3', '1', '2', '5']),
    )
  })
})
