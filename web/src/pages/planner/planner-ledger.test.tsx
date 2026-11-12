import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PlannerLedger } from './PlannerLedger'
import type { MonthRow } from '../../planner/types'

const linha = (over: Partial<MonthRow> = {}): MonthRow => ({
  mes: 1, anoDoPlano: 1, mesDoAno: 1, aporteMensal: 2_000, aporteAnual: 0,
  abatimentoApeFgts: 0, compraAVistaFgts: 0, saldoFgts: 0,
  imoveisEmConstrucao: 0, imoveisAlugados: 0, imoveisQuitados: 0, imoveisFinanciados: 0,
  totalImoveis: 0, totalParcelasFinanciamento: 0, aluguelRecebido: 0, comprasImoveis: 0, documentacao: 0,
  saldo: 0, custosImovel: 0, rendaMensalLiquida: 0, vendas: 0, valorVendas: 0, patrimonioLiquido: 75_000,
  ...over,
})

// As duas tabelas (desktop e mobile) ficam as duas no DOM — CSS decide qual aparece.
const tabelaDesktop = () => screen.getAllByRole('table')[0]
const tabelaMobile = () => screen.getAllByRole('table')[1]
const celulas = (tabela: HTMLElement, n = 1) => within(within(tabela).getAllByRole('row')[n]).getAllByRole('cell')

describe('PlannerLedger — tabela de desktop', () => {
  it('uma linha de tabela por mês', () => {
    render(<PlannerLedger linhas={[linha({ mes: 1 }), linha({ mes: 2, mesDoAno: 2 })]} />)
    expect(within(tabelaDesktop()).getAllByRole('row')).toHaveLength(3)
  })

  it('entradas e saídas do mês ficam TODAS na mesma célula, uma embaixo da outra, com nome', () => {
    render(<PlannerLedger linhas={[linha({
      aporteMensal: 2_100, aporteAnual: 96_000, aluguelRecebido: 8_000, custosImovel: 1_500,
      totalParcelasFinanciamento: 6_400, comprasImoveis: 50_000, documentacao: 3_300,
    })]} />)
    const movimentos = celulas(tabelaDesktop())[2].textContent!
    for (const trecho of [
      '+ R$ 2.100 aporte mensal', '+ R$ 96.000 aporte anual', '+ R$ 8.000 aluguéis recebidos',
      '− R$ 1.500 custos dos imóveis', '− R$ 6.400 parcelas do financiamento',
      '− R$ 50.000 pago nos studios (entrada, obra ou compra)', '− R$ 3.300 documentação',
    ]) expect(movimentos.replace(/ /g, ' ')).toContain(trecho)
  })

  it('só mostra o que aconteceu no mês: sem aporte anual, a linha dele não aparece', () => {
    render(<PlannerLedger linhas={[linha({ aporteAnual: 0, valorVendas: 0 })]} />)
    const movimentos = celulas(tabelaDesktop())[2].textContent!
    expect(movimentos).toContain('aporte mensal')
    expect(movimentos).not.toContain('aporte anual')
    expect(movimentos).not.toContain('venda')
  })

  it('tem a coluna Saldo, separada do patrimônio', () => {
    render(<PlannerLedger linhas={[linha({ saldo: 12_345, patrimonioLiquido: 987_654 })]} />)
    const cabecalhos = within(tabelaDesktop()).getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toContain('Saldo')
    const linhaDoMes = within(tabelaDesktop()).getAllByRole('row')[1]
    expect(within(linhaDoMes).getByText(/R\$\s?12\.345/)).toBeInTheDocument()
    expect(within(linhaDoMes).getByText(/R\$\s?987\.654/)).toBeInTheDocument()
  })

  it('o FGTS tem coluna própria: abatimento do apê, compra de studio pronto e saldo', () => {
    render(<PlannerLedger linhas={[linha({ abatimentoApeFgts: 50_000, compraAVistaFgts: 200_000, saldoFgts: 12_345 })]} />)
    const fgts = celulas(tabelaDesktop())[3].textContent!
    expect(fgts).toContain('abateu o apê')
    expect(fgts).toContain('comprou studio pronto')
    expect(fgts).toMatch(/12\.345 saldo/)
  })

  it('mostra a venda no mês em que ela acontece', () => {
    render(<PlannerLedger linhas={[linha({ vendas: 1, valorVendas: 345_678 })]} />)
    expect(celulas(tabelaDesktop())[2].textContent).toMatch(/\+ R\$\s?345\.678 venda de studio/)
  })

  it('mostra a contagem de imóveis por status', () => {
    render(<PlannerLedger linhas={[linha({
      imoveisEmConstrucao: 2, imoveisAlugados: 3, imoveisQuitados: 1, imoveisFinanciados: 2, totalImoveis: 5,
    })]} />)
    expect(celulas(tabelaDesktop()).slice(4, 9).map((c) => c.textContent)).toEqual(['2', '3', '1', '2', '5'])
  })
})

describe('PlannerLedger — tabela de mobile', () => {
  it('continua sendo uma TABELA, não cartão, e com menos colunas que a de desktop', () => {
    render(<PlannerLedger linhas={[linha()]} />)
    expect(tabelaMobile().tagName).toBe('TABLE')
    expect(within(tabelaMobile()).getAllByRole('columnheader').length)
      .toBeLessThan(within(tabelaDesktop()).getAllByRole('columnheader').length)
  })

  it('entradas e saídas na mesma célula, com nome e sem linha vazia', () => {
    render(<PlannerLedger linhas={[linha({ aporteMensal: 2_080, aporteAnual: 96_000, abatimentoApeFgts: 50_000 })]} />)
    const movimentos = celulas(tabelaMobile())[1].textContent!
    expect(movimentos).toContain('+ 2.080 aporte mensal')
    expect(movimentos).toContain('+ 96.000 aporte anual')
    expect(movimentos).toContain('50.000 FGTS abateu o apê')
    expect(movimentos).not.toContain('venda')
  })

  it('saldo, FGTS e patrimônio empilhados na última coluna', () => {
    render(<PlannerLedger linhas={[linha({ saldo: 12_345, saldoFgts: 6_789, patrimonioLiquido: 987_654 })]} />)
    const saldos = celulas(tabelaMobile())[3].textContent!
    expect(saldos).toContain('12.345 saldo')
    expect(saldos).toContain('6.789 FGTS')
    expect(saldos).toContain('987.654 patrim.')
  })

  it('empilha os status de imóvel dentro da mesma célula', () => {
    render(<PlannerLedger linhas={[linha({ imoveisEmConstrucao: 2, imoveisAlugados: 3, totalImoveis: 5 })]} />)
    const imoveis = celulas(tabelaMobile())[2].textContent!
    expect(imoveis).toContain('2 em construção')
    expect(imoveis).toContain('3 alugados')
    expect(imoveis).toContain('5 total')
  })
})
