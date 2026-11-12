/**
 * Os parâmetros do simulador "Vivendo de Imóveis". Comprar na planta pelo PLANO INVESTIDOR
 * da construtora (sem juros, só a correção pelo INCC), direto na holding. O motor em
 * `calc.ts` é implementação própria, testada.
 *
 * Cada parâmetro criado depois do commit f81ad5e tem um valor NEUTRO (neutro.ts) com o qual
 * o motor se comporta exatamente como naquele commit — é o que sustenta caracterizacao.test.ts.
 */
/** Quem paga IPTU/condomínio com o imóvel alugado. Vago, quem paga é SEMPRE o dono. */
export type Pagador = 'inquilino' | 'proprietario'
/** Depois do ano de transição: só parar de aportar, ou parar de trabalhar e retirar a meta. */
export type AposTransicao = 'reinveste' | 'vive_da_renda'
export type ImpostoModo = 'fixo' | 'reforma'
/** Para onde vai o dinheiro que sobra no caixa. */
export type SobraDoCaixa = 'adianta_obra' | 'automatico'
/** Como a construtora cobra: o cronograma do contrato, ou só "X% até as chaves". */
export type Cronograma = 'simples' | 'contrato'
/** Índice que corrige as parcelas da obra: o INCC dos lançamentos ou um valor próprio. */
export type CorrecaoObraModo = 'incc' | 'propria'

export type PlannerParams = {
  /** Tempo de obra de um studio comprado na planta, em meses — pagar à vista não acelera a obra. */
  prazoObraMeses: number
  /** Meses por ano sem inquilino (média de mercado). */
  vacanciaMesesAno: number
  /** IPTU, % a.a. sobre o valor atual do imóvel. */
  iptuPctAno: number
  iptuPagador: Pagador
  /** Condomínio, % a.a. sobre o valor atual do imóvel. */
  condominioPctAno: number
  condominioPagador: Pagador
  /** Taxa da imobiliária que administra o aluguel, % do aluguel recebido. */
  taxaAdmPct: number
  /** Reforma/manutenção, % a.a. do valor do imóvel — sai do caixa, não só da valorização. */
  manutencaoPctAno: number
  /** Documentação de compra, % do preço pago: ITBI, escritura e registro. */
  itbiPct: number
  escrituraPct: number
  registroPct: number
  /** Desconto ao comprar imóvel PRONTO à vista (FGTS ou dinheiro de venda), %. */
  descontoAVista: number
  /** Corretagem paga na venda, % do valor de venda. */
  corretagemVendaPct: number
  /** Imposto na venda, % do valor de venda (holding no lucro presumido ≈ 6,73%). */
  impostoVendaPct: number
  /** Ano em que para de aportar do bolso — a carteira passa a crescer só com os próprios aluguéis. */
  anoTransicao: number
  /** Modo simples: % pago até pegar as chaves (0–100); o resto é financiado. */
  pctPagoChaves: number
  /** Modo simples: juros do financiamento do saldo remanescente, % a.m. No contrato é sempre zero. */
  jurosFinHolding: number
  /** Imposto sobre a receita de aluguel na Holding (Lucro Presumido), % — 0 a 27,5. */
  impostoHolding: number
  /** Aluguel bruto mensal sobre o valor do imóvel, % a.m. */
  rate: number
  /** Dissídio anual de salário e bônus, % a.a. — cai no mês de `mesDissidio`. */
  dissidio: number
  /** Mês em que o dissídio reajusta salário e bônus (1 = janeiro … 12 = dezembro). */
  mesDissidio: number
  /** INCC / valorização dos studios NOVOS (lançamentos), % a.a. */
  incc: number
  /** Envelhecimento do imóvel + INCC de obra — reduz a valorização dos studios já comprados, % a.a. */
  depreciacao: number
  /** Saldo devedor hoje do apartamento em que você mora, R$. */
  dividaApe: number
  /** Salário bruto combinado do casal (CLT), R$/mês — só serve para calcular o FGTS. */
  salarioBrutoCasal: number
  /** Parcela mensal de hoje do financiamento do apê, R$. */
  parcelaApeAtual: number
  /** Aporte mensal do bolso — a parcela, sozinha, sem o bônus. */
  monthlyAmount: number
  /** Aporte anual do bolso — o bônus, pago de uma vez, não espalhado pelo ano. */
  annualAmount: number
  /** Mês em que o aporte anual cai (1 = janeiro … 12 = dezembro). */
  annualMonth: number
  /** Já pago no 1º studio, R$. */
  initial: number
  /** Custo hoje de 1 studio completo (imóvel + mobília/ITBI), R$. */
  custoStudio: number
  /** Horizonte da simulação, em anos. */
  years: number

  // ---- pacote 1: calendário, inflação, viver de renda ----
  /** Inflação (IPCA), % a.a.: corrige a meta de renda e os custos em reais. */
  ipca: number
  /** Quanto a família quer por mês para viver, em reais de HOJE. */
  metaRendaHoje: number
  aposTransicao: AposTransicao

  // ---- pacote 2: precisão do motor ----
  /** Meses que faltam no financiamento do apê (0 = o apê só cai com o FGTS). */
  prazoApeMeses: number
  /** Meses até a entrega do 1º studio (o do "já pago"). */
  mesesEntrega1o: number
  /** Acabamento e mobília para alugar, R$ de hoje por studio. */
  custoMontagem: number
  /** Meses entre as chaves e o primeiro inquilino. */
  mesesAteAlugar: number
  /** Rendimento do caixa parado, % a.a. líquido. */
  rendimentoCaixaAno: number
  sobraDoCaixa: SobraDoCaixa
  /** Contador e taxas da holding, R$ de hoje por mês. */
  custoFixoHoldingMes: number

  // ---- pacote 3 ----
  impostoModo: ImpostoModo

  // ---- pacote 9: contrato do plano investidor, reserva ----
  cronograma: Cronograma
  correcaoObraModo: CorrecaoObraModo
  /** Correção das parcelas da obra e do saldo depois das chaves, % a.a. (padrão: média do INCC de 2 anos). */
  correcaoObraAno: number
  /** % do preço de contrato pago no ato. */
  entradaPct: number
  /** % diluído em parcelas mensais até as chaves. */
  mensaisPct: number
  /** % diluído em reforços periódicos. */
  reforcoPct: number
  reforcoCadaMeses: number
  /** % pago na entrega das chaves. */
  chavesPct: number
  /** Meses em que o resto (100 − o que vai até as chaves) é parcelado depois da entrega. */
  posChavesMeses: number
  /** Meses de obrigações que o caixa mantém guardados antes de comprar. */
  reservaMeses: number

  // ---- pacote 5: temporada (Airbnb) ----
  pctTemporada: number
  diariaHoje: number
  ocupacaoPct: number
  taxaPlataformaPct: number
  taxaGestaoPct: number
  custoFixoTemporadaMes: number
  manutencaoTemporadaPctAno: number
  impostoTemporadaPct: number
  custoMontagemTemporada: number

  // ---- pacote 7: consórcio ----
  consorcioCotas: number
  consorcioPrazoMeses: number
  consorcioTaxaTotalPct: number
  consorcioIntervaloMeses: number
  consorcioLancePct: number

  // ---- pacote 8: planta, ágio, venda nas chaves ----
  agioProntoPct: number
  pctVendaNasChaves: number
}

export const DEFAULT_PARAMS: PlannerParams = {
  prazoObraMeses: 36,
  vacanciaMesesAno: 1,
  iptuPctAno: 0.6,
  iptuPagador: 'inquilino',
  condominioPctAno: 2,
  condominioPagador: 'inquilino',
  taxaAdmPct: 8,
  manutencaoPctAno: 0.5,
  itbiPct: 3,
  escrituraPct: 0.5,
  registroPct: 0.5,
  descontoAVista: 5,
  corretagemVendaPct: 6,
  impostoVendaPct: 6.73,
  anoTransicao: 10,
  pctPagoChaves: 70,
  jurosFinHolding: 0,
  impostoHolding: 11.5,
  rate: 0.65,
  dissidio: 5,
  mesDissidio: 8,
  incc: 6.5,
  depreciacao: 2,
  dividaApe: 400_000,
  salarioBrutoCasal: 34_000,
  parcelaApeAtual: 4_000,
  monthlyAmount: 2_000,
  annualAmount: 96_000,
  annualMonth: 12,
  initial: 75_000,
  custoStudio: 260_000,
  years: 15,

  ipca: 4.5,
  metaRendaHoje: 15_000,
  aposTransicao: 'vive_da_renda',

  prazoApeMeses: 300,
  mesesEntrega1o: 36,
  custoMontagem: 12_000,
  mesesAteAlugar: 2,
  rendimentoCaixaAno: 8,
  sobraDoCaixa: 'automatico',
  custoFixoHoldingMes: 800,

  impostoModo: 'reforma',

  cronograma: 'contrato',
  correcaoObraModo: 'propria',
  correcaoObraAno: 6.66,
  entradaPct: 10,
  mensaisPct: 25,
  reforcoPct: 15,
  reforcoCadaMeses: 12,
  chavesPct: 20,
  posChavesMeses: 36,
  reservaMeses: 3,

  pctTemporada: 0,
  diariaHoje: 256,
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
}

export type YearPoint = {
  ano: number
  /** Ano civil do ponto (ex.: 2031). */
  anoCalendario: number
  patrimonioLiquido: number
  precoStudioNovo: number
  studiosComChaves: number
  studiosQuitadosEquiv: number
  rendaMensalLiquida: number
  /** Dívida: financiamento das prontas + o que falta pagar/financiar nas obras (+ consórcio). */
  divida: number
}

/**
 * Uma linha do diário de bordo — um mês, com tudo que se moveu nele. `studiosComChaves`
 * é o mesmo "pronto/alugado" de `YearPoint`; aqui ele já vem separado em quitado vs.
 * ainda financiado, porque é exatamente essa separação que o diário existe pra mostrar.
 */
export type MonthRow = {
  /** Índice absoluto do mês desde o início da simulação: 1, 2, 3… */
  mes: number
  /** Ano do plano a que este mês pertence: 1 no primeiro ano, 2 no segundo… */
  anoDoPlano: number
  /** Ano civil do mês (ex.: 2027). */
  ano: number
  /** Mês do ano civil: 1 = janeiro … 12 = dezembro. */
  mesDoAno: number
  aporteMensal: number
  aporteAnual: number
  /** Quanto o FGTS abateu do saldo do apê neste mês (0 na maioria — só nos meses de saque). */
  abatimentoApeFgts: number
  /** Quanto da sobra do FGTS (depois de abater o apê) comprou studio PRONTO à vista neste mês. */
  compraAVistaFgts: number
  /** Saldo do FUNDO do FGTS no fim do mês — rende sozinho, à parte do patrimônio em studios. */
  saldoFgts: number
  imoveisEmConstrucao: number
  imoveisAlugados: number
  imoveisQuitados: number
  imoveisFinanciados: number
  totalImoveis: number
  totalParcelasFinanciamento: number
  /** Aluguel que entrou no mês, já descontada a vacância e antes dos custos. */
  aluguelRecebido: number
  /** Dinheiro do caixa pago por imóveis no mês: entrada, parcelas de obra, compra pronta. */
  comprasImoveis: number
  /** ITBI, escritura e registro pagos no mês. */
  documentacao: number
  /** Dinheiro em caixa no fim do mês — o que sobrou acumulado, fora dos imóveis e do FGTS. */
  saldo: number
  /** O que sai do aluguel antes de virar renda: imposto, imobiliária, IPTU/condomínio do dono, manutenção. */
  custosImovel: number
  rendaMensalLiquida: number
  /** Studios vendidos neste mês (a venda só acontece quando o sistema calcula que compensa). */
  vendas: number
  /** Quanto as vendas do mês renderam, já sem corretagem e imposto. */
  valorVendas: number
  patrimonioLiquido: number

  // ---- pacote 1 ----
  /** Meta de renda do mês: `metaRendaHoje` corrigida pela inflação. */
  metaDoMes: number
  /** O que sobra dos aluguéis depois dos custos e de todas as parcelas/obrigações. */
  rendaDisponivel: number
  /** O que saiu do caixa para a família viver. */
  retirada: number
  /** Parcela do apê paga pelo caixa (só no modo "vivo da renda", depois da transição). */
  parcelaApePaga: number
  // ---- pacote 2 ----
  saldoApe: number
  parcelaApe: number
  montagem: number
  rendimentoCaixa: number
  custoFixoHolding: number
  // ---- pacote 4 / 9 ----
  amortizacaoExtra: number
  dividaFinanciamento: number
  aPagarObra: number
  valorImoveis: number
  parcelasObra: number
  obrigacoesMes: number
  // ---- pacote 7 ----
  parcelasConsorcio: number
  lanceConsorcio: number
  contemplacoes: number
  contemplacoesAtrasadas: number
  dividaConsorcio: number
}
