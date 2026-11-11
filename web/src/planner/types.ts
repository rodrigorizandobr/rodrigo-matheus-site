/**
 * Os 18 parâmetros do simulador "Vivendo de Imóveis" — uma estratégia só (comprar
 * direto na holding, financiando o saldo remanescente nas chaves), reconstruída a
 * partir de uma conversa longa no Gemini (ver PR). O motor em `calc.ts` é
 * implementação própria, testada: o código do canvas do Gemini não dava para
 * extrair por inteiro (editor virtualizado, só renderiza a parte visível).
 */
export type PlannerParams = {
  /** Ano em que para de aportar do bolso — a carteira passa a crescer só com os próprios aluguéis. */
  anoTransicao: number
  /** % pago até pegar as chaves (0–100); o resto é financiado direto na construtora. */
  pctPagoChaves: number
  /** Juros do financiamento do saldo remanescente na holding, % a.m. */
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
}

export const DEFAULT_PARAMS: PlannerParams = {
  anoTransicao: 10,
  pctPagoChaves: 70,
  jurosFinHolding: 0.8,
  impostoHolding: 11.5,
  rate: 0.8,
  dissidio: 5,
  mesDissidio: 8,
  incc: 6,
  depreciacao: 1.5,
  dividaApe: 400_000,
  salarioBrutoCasal: 34_000,
  parcelaApeAtual: 4_000,
  monthlyAmount: 2_000,
  annualAmount: 96_000,
  annualMonth: 12,
  initial: 75_000,
  custoStudio: 260_000,
  years: 15,
}

export type YearPoint = {
  ano: number
  patrimonioLiquido: number
  precoStudioNovo: number
  studiosComChaves: number
  studiosQuitadosEquiv: number
  rendaMensalLiquida: number
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
  /** Mês do ano civil: 1 = janeiro … 12 = dezembro. */
  mesDoAno: number
  aporteMensal: number
  aporteAnual: number
  /** Quanto o FGTS abateu do saldo do apê neste mês (0 na maioria — só nos meses de saque). */
  abatimentoApeFgts: number
  /** Quanto da sobra do FGTS (depois de abater o apê) comprou um studio à vista neste mês. */
  compraAVistaFgts: number
  /** Saldo do FUNDO do FGTS no fim do mês — rende sozinho, à parte do patrimônio em studios. */
  saldoFgts: number
  imoveisEmConstrucao: number
  imoveisAlugados: number
  imoveisQuitados: number
  imoveisFinanciados: number
  totalImoveis: number
  totalParcelasFinanciamento: number
  rendaMensalLiquida: number
  patrimonioLiquido: number
}
