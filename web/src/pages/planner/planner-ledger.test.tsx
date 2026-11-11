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

// As duas tabelas (desktop e mobile) ficam as duas no DOM — CSS decide qual aparece, não
// os testes. A desktop é sempre a primeira no JSX.
const tabelaDesktop = () => screen.getAllByRole('table')[0]
const tabelaMobile = () => screen.getAllByRole('table')[1]

describe('PlannerLedger — tabela de desktop (uma coluna por tipo de dado)', () => {
  it('uma linha de tabela por mês', () => {
    render(<PlannerLedger linhas={[linha({ mes: 1 }), linha({ mes: 2, anoDoPlano: 1, mesDoAno: 2 })]} />)
    expect(within(tabelaDesktop()).getAllByRole('row')).toHaveLength(3) // cabeçalho + 2 meses
  })

  it('mostra o aporte anual só quando ele cai naquele mês', () => {
    render(<PlannerLedger linhas={[
      linha({ mes: 1, aporteAnual: 0 }),
      linha({ mes: 12, mesDoAno: 12, aporteAnual: 96_000 }),
    ]} />)
    const linhasTabela = within(tabelaDesktop()).getAllByRole('row')
    expect(within(linhasTabela[2]).getByText(/R\$\s?96\.000/)).toBeInTheDocument()
  })

  it('mostra as amortizações, compras à vista e o saldo do FGTS', () => {
    render(<PlannerLedger linhas={[linha({
      abatimentoApeFgts: 50_000, compraAVistaFgts: 0, saldoFgts: 12_345,
    })]} />)
    const row = within(tabelaDesktop()).getAllByRole('row')[1]
    expect(within(row).getByText(/R\$\s?50\.000/)).toBeInTheDocument()
    expect(within(row).getByText(/R\$\s?12\.345/)).toBeInTheDocument()
  })

  it('mostra a contagem de imóveis por status', () => {
    render(<PlannerLedger linhas={[linha({
      imoveisEmConstrucao: 2, imoveisAlugados: 3, imoveisQuitados: 1, imoveisFinanciados: 2, totalImoveis: 5,
    })]} />)
    const row = within(tabelaDesktop()).getAllByRole('row')[1]
    const cols = within(row).getAllByRole('cell')
    expect(cols.map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['2', '3', '1', '2', '5']),
    )
  })
})

describe('PlannerLedger — tabela de mobile (menos colunas, grupos empilhados na célula)', () => {
  it('continua sendo uma TABELA, não cartão — pedido do PO depois de ver a versão em cartão', () => {
    render(<PlannerLedger linhas={[linha()]} />)
    expect(tabelaMobile().tagName).toBe('TABLE')
  })

  it('tem menos colunas que a de desktop', () => {
    render(<PlannerLedger linhas={[linha()]} />)
    const colunasDesktop = within(tabelaDesktop()).getAllByRole('columnheader').length
    const colunasMobile = within(tabelaMobile()).getAllByRole('columnheader').length
    expect(colunasMobile).toBeLessThan(colunasDesktop)
  })

  it('aporte e FGTS dividem a MESMA célula — uma coluna a menos', () => {
    render(<PlannerLedger linhas={[linha({
      aporteMensal: 2_080, aporteAnual: 96_000, abatimentoApeFgts: 50_000, saldoFgts: 12_345,
    })]} />)
    const row = within(tabelaMobile()).getAllByRole('row')[1]
    const celulaAportesFgts = within(row).getAllByRole('cell')[1]
    expect(within(celulaAportesFgts).getByText('2.080')).toBeInTheDocument()
    expect(within(celulaAportesFgts).getByText('96.000')).toBeInTheDocument()
    expect(within(celulaAportesFgts).getByText('50.000')).toBeInTheDocument()
    expect(within(celulaAportesFgts).getByText('12.345')).toBeInTheDocument()
  })

  it('só mostra o que aconteceu naquele mês — sem aporte anual nem saque de FGTS, não aparece linha nenhuma pra eles', () => {
    render(<PlannerLedger linhas={[linha({
      aporteMensal: 2_080, aporteAnual: 0, abatimentoApeFgts: 0, compraAVistaFgts: 0, saldoFgts: 3_000,
    })]} />)
    const row = within(tabelaMobile()).getAllByRole('row')[1]
    const celulaAportesFgts = within(row).getAllByRole('cell')[1]
    expect(celulaAportesFgts.textContent).not.toContain('anual')
    expect(celulaAportesFgts.textContent).not.toContain('abate apê')
    expect(celulaAportesFgts.textContent).not.toContain('à vista')
    // o que SEMPRE existe (mensal e saldo do FGTS) continua aparecendo
    expect(celulaAportesFgts.textContent).toContain('mensal')
    expect(celulaAportesFgts.textContent).toContain('saldo FGTS')
  })

  it('empilha os 5 status de imóvel dentro da mesma célula', () => {
    render(<PlannerLedger linhas={[linha({
      imoveisEmConstrucao: 2, imoveisAlugados: 3, imoveisQuitados: 1, imoveisFinanciados: 2, totalImoveis: 5,
    })]} />)
    const row = within(tabelaMobile()).getAllByRole('row')[1]
    const celulaImoveis = within(row).getAllByRole('cell')[2]
    expect(celulaImoveis.textContent).toContain('2')
    expect(celulaImoveis.textContent).toContain('3')
    expect(celulaImoveis.textContent).toContain('5')
  })
})
