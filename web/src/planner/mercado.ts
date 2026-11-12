/**
 * O único lugar onde mora um número de mercado. Atualizar o simulador para 2027 é editar este
 * arquivo. Fontes e datas: specs/001-imoveis-realismo-2026/referencias-2026.md.
 */
export type Referencia = { valor: number; texto: string }
export const MERCADO_DATA = '2026-11' // mês da coleta

export const MERCADO = {
  aluguel: { valor: 0.65, texto: 'Centro de São Paulo: cerca de R$ 65–67 por m² (Seu Dinheiro, 2026) num studio de ~26 m² vendido a ~R$ 270 mil dá ≈ 0,65% a.m.; FipeZap set/2026: São Paulo 6,43% a.a., 1 dormitório 6,74% a.a.' },
  incc: { valor: 6.75, texto: 'INCC-M em 12 meses até out/2026: 6,75% (FGV)' },
  inccMedia2anos: { valor: 6.66, texto: 'INCC-M em 12 meses: 6,58% até out/2025 e 6,75% até out/2026 (FGV); média composta de 6,66% a.a.' },
  usado: { valor: 4.5, texto: 'FipeZap venda: +4,54% no ano até out/2026; em São Paulo, cerca de +3%' },
  ipca: { valor: 4.9, texto: 'Focus de 9/11/2026: 5,22% em 2026 e 4,90% em 2027' },
  caixa: { valor: 14.19, texto: 'CDI em 12 meses até out/2026: 14,19% bruto. Selic em 13,75% a.a.; o Focus projeta 11% em 2028' },
  construtora: { valor: 0, texto: 'Plano investidor: sem juros, parcelado até as chaves e, em algumas construtoras, os 30% finais depois. Confira no seu contrato o índice de correção' },
  consorcio: { valor: 20, texto: 'Taxa de administração do plano inteiro: 15% (média ABAC, 207 meses) a 21% (Banco Central, grupos novos)' },
  diaria: { valor: 256, texto: 'Centro de São Paulo, 1 dormitório: diária de R$ 256 (BnBCalc); R$ 240 na cidade (Airbtics)' },
  ocupacao: { valor: 42, texto: 'Centro de São Paulo: 42% de ocupação (BnBCalc); 62% na cidade toda (Airbtics)' },
  plataforma: { valor: 16, texto: 'Airbnb no Brasil em 2026: taxa única de cerca de 16%, cobrada do anfitrião' },
} as const satisfies Record<string, Referencia>

/** Só os três números que são medição de mercado, não escolha pessoal. */
export function aplicarReferencias<T extends { rate: number; incc: number; depreciacao: number }>(p: T): T {
  return {
    ...p,
    rate: MERCADO.aluguel.valor,
    incc: MERCADO.incc.valor,
    depreciacao: Math.round((MERCADO.incc.valor - MERCADO.usado.valor) * 100) / 100,
  }
}
