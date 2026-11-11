/**
 * Os 15 parâmetros do simulador "Vivendo de Imóveis" — uma estratégia só (comprar
 * direto na holding, financiando o saldo remanescente nas chaves), reconstruída a
 * partir de uma conversa longa no Gemini (ver PR). O motor em `calc.ts` é
 * implementação própria, testada: o código do canvas do Gemini não dava para
 * extrair por inteiro (editor virtualizado, só renderiza a parte visível).
 */
export type PlannerParams = {
  /** Ano em que para de aportar do bolso — a carteira passa a crescer só com os próprios aluguéis. */
  anoTransicao: number
  /** % pago até pegar as chaves (0–100); o resto é financiado na holding. */
  pctPagoChaves: number
  /** Juros do financiamento do saldo remanescente na holding, % a.m. */
  jurosFinHolding: number
  /** Imposto sobre a receita de aluguel na Holding (Lucro Presumido), % — 0 a 27,5. */
  impostoHolding: number
  /** Aluguel bruto mensal sobre o valor do imóvel, % a.m. */
  rate: number
  /** Dissídio anual de salário e bônus, sempre em agosto, % a.a. */
  dissidio: number
  /** INCC / valorização dos studios NOVOS (lançamentos), % a.a. */
  incc: number
  /** Envelhecimento do imóvel + INCC de obra — reduz a valorização dos studios já comprados, % a.a. */
  depreciacao: number
  /** Abatimento no financiamento do apartamento a cada 3 anos, R$. */
  abate3anos: number
  /** Saldo financiado atual do apartamento, R$. */
  dividaApe: number
  /** Aporte extra por mês para cada R$100k abatidos no apê, R$. */
  extra100k: number
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
  incc: 6,
  depreciacao: 1.5,
  abate3anos: 110_000,
  dividaApe: 400_000,
  extra100k: 1_000,
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
