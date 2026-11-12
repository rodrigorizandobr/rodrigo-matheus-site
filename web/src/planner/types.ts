/**
 * Os parâmetros do simulador "Vivendo de Imóveis" — uma estratégia só (comprar
 * direto na holding, financiando o saldo remanescente nas chaves), reconstruída a
 * partir de uma conversa longa no Gemini (ver PR). O motor em `calc.ts` é
 * implementação própria, testada: o código do canvas do Gemini não dava para
 * extrair por inteiro (editor virtualizado, só renderiza a parte visível).
 */
/** Quem paga IPTU/condomínio com o imóvel alugado. Vago, quem paga é SEMPRE o dono. */
export type Pagador = 'inquilino' | 'proprietario'

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
  /** Valor máximo de imóvel em que o FGTS pode ser usado (teto do SFH); 0 = não usa FGTS pra comprar. */
  fgtsTetoImovel: number
  /** Corretagem paga na venda, % do valor de venda. */
  corretagemVendaPct: number
  /** Imposto na venda, % do valor de venda (holding no lucro presumido ≈ 6,73%). */
  impostoVendaPct: number
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
  fgtsTetoImovel: 2_250_000,
  corretagemVendaPct: 6,
  impostoVendaPct: 6.73,
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
  /** O que sai do aluguel antes de virar renda: imposto, imobiliária, IPTU/condomínio do dono, manutenção. */
  custosImovel: number
  rendaMensalLiquida: number
  /** Studios vendidos neste mês (a venda só acontece quando o sistema calcula que compensa). */
  vendas: number
  /** Quanto as vendas do mês renderam, já sem corretagem e imposto. */
  valorVendas: number
  patrimonioLiquido: number
}
