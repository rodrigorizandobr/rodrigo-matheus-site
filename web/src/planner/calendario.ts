/** O calendário do plano: o mês 1 é o mês em que a pessoa abre a página, não sempre janeiro. */
export type Inicio = { ano: number; mes: number } // mes: 1 = janeiro … 12 = dezembro

/** O que os testes usam: o mês 1 é janeiro de 2026. */
export const INICIO_PADRAO: Inicio = { ano: 2026, mes: 1 }

/** A ÚNICA porta do simulador para o relógio. Quem chama é a página, nunca o motor. */
export function inicioDeHoje(agora: Date = new Date()): Inicio {
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 }
}

/** Data civil do mês-índice `mes` (1, 2, 3…) de um plano que começa em `inicio`. */
export function dataDoMes(mes: number, inicio: Inicio): { ano: number; mesDoAno: number } {
  const i = inicio.mes - 1 + (mes - 1)
  return { ano: inicio.ano + Math.floor(i / 12), mesDoAno: (i % 12) + 1 }
}

const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const rotuloMesAno = (ano: number, mesDoAno: number): string => `${ABREV[mesDoAno - 1]}/${ano}`
