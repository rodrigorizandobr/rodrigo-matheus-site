import type { PlannerParams } from './types'

/**
 * O valor NEUTRO de cada parâmetro criado depois do commit f81ad5e: com todos eles o motor
 * se comporta exatamente como naquele commit. É o que os testes de mecânica e o teste de
 * caracterização usam — DEFAULT_PARAMS é realista, isto aqui é "tudo desligado".
 * Os campos que só valem num modo desligado (contrato, temporada, consórcio) levam o valor
 * padrão só para nunca serem `undefined`.
 */
export const NEUTRO: Partial<PlannerParams> = {
  ipca: 4.5,
  metaRendaHoje: 0,
  aposTransicao: 'reinveste',

  prazoApeMeses: 0,
  mesesEntrega1o: 36,
  custoMontagem: 0,
  mesesAteAlugar: 0,
  rendimentoCaixaAno: 0,
  sobraDoCaixa: 'adianta_obra',
  custoFixoHoldingMes: 0,

  impostoModo: 'fixo',

  cronograma: 'simples',
  correcaoObraModo: 'incc',
  correcaoObraAno: 6.66,
  correcaoPosChavesAno: 0,
  parcelamento: 'manual',
  parcelaMensal1o: 0,
  parcelaAnual1o: 0,
  entradaPct: 10,
  mensaisPct: 25,
  reforcoPct: 15,
  reforcoCadaMeses: 12,
  chavesPct: 20,
  posChavesMeses: 36,
  reservaMeses: 0,

  pctTemporada: 0,
  diariaHoje: 256,
  diariaPct: 0.1,
  ocupacaoPct: 42,
  taxaPlataformaPct: 16,
  taxaGestaoPct: 20,
  custoFixoTemporadaMes: 450,
  manutencaoTemporadaPctAno: 1.5,
  impostoTemporadaPct: 11.5,
  custoMontagemTemporada: 35_000,

  consorcioCotas: 0,
  consorcioPrazoMeses: 200,
  consorcioTaxaTotalPct: 20,
  consorcioIntervaloMeses: 24,
  consorcioLancePct: 25,

  agioProntoPct: 0,
  pctVendaNasChaves: 0,

  leilaoDescontoPct: 30,
  leilaoComissaoPct: 5,
  leilaoJuridicoPct: 3,
  leilaoReformaPct: 10,
  leilaoMesesAteAlugar: 10,
  annualSalarios: 0,
}
