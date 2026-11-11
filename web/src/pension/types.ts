/**
 * Parâmetros do simulador "Previdência Privada" — irmão do "Vivendo de Imóveis"
 * (mesmo salário CLT + FGTS amortizando o apê), só que o destino do aporte é um
 * fundo de PGBL/VGBL de verdade, com as regras fiscais do produto (ver calc.ts).
 */
export type Vehicle = 'PGBL' | 'VGBL'
export type Regime = 'regressiva' | 'progressiva'

export type PensionParams = {
  /** PGBL deduz até 12% da renda bruta anual do IR (regime completo); VGBL não deduz nada. */
  vehicle: Vehicle
  /** Regressiva: alíquota cai com o tempo de cada aporte (35% a 10%), definitiva. Progressiva: alíquota marginal informada abaixo, na declaração anual. */
  regime: Regime
  /** Salário bruto combinado do casal (CLT), R$/mês — FGTS e teto de dedução do PGBL. */
  salarioBrutoCasal: number
  /** Dissídio anual de salário, % a.a. — cai no mês de `mesDissidio`. */
  dissidio: number
  /** Mês em que o dissídio reajusta o salário (1 = janeiro … 12 = dezembro). */
  mesDissidio: number
  /** Saldo devedor hoje do apartamento em que você mora, R$. */
  dividaApe: number
  /** Parcela mensal de hoje do financiamento do apê, R$. */
  parcelaApeAtual: number
  /** Aporte mensal na previdência, R$. */
  monthlyAmount: number
  /** Aporte anual extra (ex.: parte do 13º/bônus), R$ — cai de uma vez no mês escolhido. */
  annualAmount: number
  /** Mês em que o aporte anual cai (1 = janeiro … 12 = dezembro). */
  annualMonth: number
  /** Saldo já acumulado na previdência hoje, R$. */
  initial: number
  /** Rendimento bruto do fundo escolhido, % a.a. */
  rendimentoAnual: number
  /** Taxa de administração do fundo, % a.a. — reduz o rendimento bruto. */
  taxaAdministracaoAnual: number
  /** Sua alíquota marginal de IR — estima a restituição do PGBL e o imposto no regime progressivo. */
  aliquotaIrMarginal: number
  /** Horizonte da simulação (fase de acumulação), em anos. */
  years: number
}

export const DEFAULT_PARAMS: PensionParams = {
  vehicle: 'PGBL',
  regime: 'regressiva',
  salarioBrutoCasal: 34_000,
  dissidio: 5,
  mesDissidio: 8,
  dividaApe: 400_000,
  parcelaApeAtual: 4_000,
  monthlyAmount: 2_000,
  annualAmount: 20_000,
  annualMonth: 12,
  initial: 50_000,
  rendimentoAnual: 10,
  taxaAdministracaoAnual: 1,
  aliquotaIrMarginal: 27.5,
  years: 25,
}

export type PensionYearPoint = {
  ano: number
  saldoBruto: number
  saldoLiquidoEstimado: number
  /** Alíquota média ponderada do regime regressivo se resgatasse tudo agora, % — só informativo. */
  aliquotaMedia: number
  /** Renda mensal estimada sem consumir o principal: saldo líquido × rendimento líquido mensal. */
  rendaMensalEstimada: number
}

/** Uma linha do diário de bordo — um mês, com tudo que se moveu nele. */
export type PensionMonthRow = {
  /** Índice absoluto do mês desde o início da simulação: 1, 2, 3… */
  mes: number
  /** Ano do plano a que este mês pertence: 1 no primeiro ano, 2 no segundo… */
  anoDoPlano: number
  /** Mês do ano civil: 1 = janeiro … 12 = dezembro. */
  mesDoAno: number
  aporteMensal: number
  aporteAnual: number
  /** Restituição de IR do PGBL do ano anterior, reinvestida automaticamente (só PGBL). */
  restituicaoPgbl: number
  /** Quanto o FGTS abateu do saldo do apê neste mês (0 na maioria — só nos meses de saque). */
  abatimentoApeFgts: number
  /** Sobra do FGTS depois de abater o apê — vira aporte extra na previdência neste mês. */
  aporteFgtsExtra: number
  /** Saldo do FUNDO do FGTS no fim do mês — rende sozinho, à parte da previdência. */
  saldoFgts: number
  /** Saldo acumulado na previdência, bruto de IR. */
  saldoBruto: number
  /** Saldo estimado se resgatasse tudo agora, já descontado o IR do regime escolhido. */
  saldoLiquidoEstimado: number
  /** Quanto o saldo rendeu neste mês (já líquido da taxa de administração). */
  rendimentoDoMes: number
  /** Alíquota média ponderada se resgatasse tudo agora, % — igual à de `PensionYearPoint`. */
  aliquotaMedia: number
}
