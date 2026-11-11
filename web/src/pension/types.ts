/**
 * Parâmetros do simulador "Previdência Privada" — plano corporativo de verdade:
 * o empregado contribui um % do salário (básico, com contrapartida da empresa
 * por faixa etária, + extra/facultativo, sem contrapartida nenhuma), o dinheiro
 * cai num fundo de PGBL/VGBL com as regras fiscais do produto (ver calc.ts).
 * Sem FGTS/apê: isso pertencia ao simulador de imóveis, não faz sentido aqui.
 */
export type Vehicle = 'PGBL' | 'VGBL'
export type Regime = 'regressiva' | 'progressiva'

/** Uma faixa de contrapartida da empresa: nesta faixa de idade (inclusive nos dois
 * extremos), a empresa aporta `percentual`% do que o empregado aportou no básico. */
export type FaixaEmpresa = {
  idadeMin: number
  idadeMax: number
  /** 100 = empresa paga o mesmo que o empregado; 200 = o dobro. */
  percentual: number
}

export type PensionParams = {
  /** PGBL deduz até 12% da renda bruta anual do IR (regime completo); VGBL não deduz nada. */
  vehicle: Vehicle
  /** Regressiva: alíquota cai com o tempo de cada aporte (35% a 10%), definitiva. Progressiva: alíquota marginal informada abaixo, na declaração anual. */
  regime: Regime
  /** Idade hoje, em anos — decide em qual faixa de contrapartida a pessoa está a cada mês. */
  idadeAtual: number
  /** Salário bruto hoje, R$/mês. */
  salarioBruto: number
  /** Dissídio anual de salário, % a.a. — cai no mês de `mesDissidio`. */
  dissidio: number
  /** Mês em que o dissídio reajusta o salário (1 = janeiro … 12 = dezembro). */
  mesDissidio: number
  /** Contribuição básica do empregado, % do salário — recebe contrapartida da empresa pela faixa etária. */
  aporteBasicoPct: number
  /** Contribuição extra/facultativa do empregado, % do salário — só do próprio bolso, sem contrapartida. */
  aporteExtraPct: number
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
  /** Faixas de contrapartida da empresa por idade — inserir, editar e apagar livremente. */
  faixasEmpresa: FaixaEmpresa[]
}

export const DEFAULT_PARAMS: PensionParams = {
  vehicle: 'PGBL',
  regime: 'regressiva',
  idadeAtual: 35,
  salarioBruto: 15_000,
  dissidio: 5,
  mesDissidio: 8,
  aporteBasicoPct: 5,
  aporteExtraPct: 0,
  initial: 50_000,
  rendimentoAnual: 10,
  taxaAdministracaoAnual: 1,
  aliquotaIrMarginal: 27.5,
  years: 25,
  faixasEmpresa: [
    { idadeMin: 0, idadeMax: 40, percentual: 100 },
    { idadeMin: 41, idadeMax: 50, percentual: 150 },
    { idadeMin: 51, idadeMax: 120, percentual: 200 },
  ],
}

export type PensionYearPoint = {
  ano: number
  idade: number
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
  /** Idade (anos completos) neste mês — decide a faixa de contrapartida da empresa. */
  idade: number
  aporteBasico: number
  aporteExtra: number
  /** Contrapartida da empresa sobre o aporte básico, pela faixa etária do mês. */
  aporteEmpresa: number
  /** Restituição de IR do PGBL do ano anterior, reinvestida automaticamente (só PGBL). */
  restituicaoPgbl: number
  /** Saldo acumulado na previdência, bruto de IR. */
  saldoBruto: number
  /** Saldo estimado se resgatasse tudo agora, já descontado o IR do regime escolhido. */
  saldoLiquidoEstimado: number
  /** Quanto o saldo rendeu neste mês (já líquido da taxa de administração). */
  rendimentoDoMes: number
  /** Alíquota média ponderada se resgatasse tudo agora, % — igual à de `PensionYearPoint`. */
  aliquotaMedia: number
}
