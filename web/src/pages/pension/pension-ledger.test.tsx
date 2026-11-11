import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PensionLedger } from './PensionLedger'
import type { PensionMonthRow } from '../../pension/types'

const linha = (over: Partial<PensionMonthRow> = {}): PensionMonthRow => ({
  mes: 1, anoDoPlano: 1, mesDoAno: 1, aporteMensal: 2_000, aporteAnual: 0,
  restituicaoPgbl: 0, abatimentoApeFgts: 0, aporteFgtsExtra: 0, saldoFgts: 0,
  saldoBruto: 75_000, saldoLiquidoEstimado: 60_000, rendimentoDoMes: 500, aliquotaMedia: 20,
  ...over,
})

// As duas tabelas (desktop e mobile) ficam as duas no DOM — CSS decide qual aparece.
const tabelaDesktop = () => screen.getAllByRole('table')[0]
const tabelaMobile = () => screen.getAllByRole('table')[1]

describe('PensionLedger — tabela de desktop', () => {
  it('uma linha de tabela por mês', () => {
    render(<PensionLedger linhas={[linha({ mes: 1 }), linha({ mes: 2, mesDoAno: 2 })]} />)
    expect(within(tabelaDesktop()).getAllByRole('row')).toHaveLength(3)
  })

  it('mostra a restituição do PGBL só quando ela cai naquele mês', () => {
    render(<PensionLedger linhas={[
      linha({ mes: 1, restituicaoPgbl: 0 }),
      linha({ mes: 5, mesDoAno: 5, restituicaoPgbl: 3_960 }),
    ]} />)
    const row = within(tabelaDesktop()).getAllByRole('row')[2]
    expect(within(row).getByText(/R\$\s?3\.960/)).toBeInTheDocument()
  })

  it('mostra o abatimento do apê e o aporte extra do FGTS', () => {
    render(<PensionLedger linhas={[linha({ abatimentoApeFgts: 30_000, aporteFgtsExtra: 10_000 })]} />)
    const row = within(tabelaDesktop()).getAllByRole('row')[1]
    expect(within(row).getByText(/R\$\s?30\.000/)).toBeInTheDocument()
    expect(within(row).getByText(/R\$\s?10\.000/)).toBeInTheDocument()
  })
})

describe('PensionLedger — tabela de mobile', () => {
  it('continua sendo uma TABELA, não cartão', () => {
    render(<PensionLedger linhas={[linha()]} />)
    expect(tabelaMobile().tagName).toBe('TABLE')
  })

  it('tem menos colunas que a de desktop', () => {
    render(<PensionLedger linhas={[linha()]} />)
    const colunasDesktop = within(tabelaDesktop()).getAllByRole('columnheader').length
    const colunasMobile = within(tabelaMobile()).getAllByRole('columnheader').length
    expect(colunasMobile).toBeLessThan(colunasDesktop)
  })

  it('só mostra o que aconteceu naquele mês', () => {
    render(<PensionLedger linhas={[linha({
      aporteMensal: 2_080, aporteAnual: 0, restituicaoPgbl: 0, abatimentoApeFgts: 0, aporteFgtsExtra: 0, saldoFgts: 3_000,
    })]} />)
    const row = within(tabelaMobile()).getAllByRole('row')[1]
    const celula = within(row).getAllByRole('cell')[1]
    expect(celula.textContent).not.toContain('anual')
    expect(celula.textContent).not.toContain('restituição')
    expect(celula.textContent).toContain('mensal')
    expect(celula.textContent).toContain('saldo FGTS')
  })
})
