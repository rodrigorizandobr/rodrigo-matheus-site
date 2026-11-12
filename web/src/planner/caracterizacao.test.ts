import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { NEUTRO } from './neutro'
import type { MonthRow, PlannerParams } from './types'

/**
 * Congela o comportamento do motor do commit f81ad5e. Todo parâmetro criado depois tem um valor
 * NEUTRO (neutro.ts) com o qual o motor tem que continuar dando exatamente estes números.
 * Se este teste quebrar, o ERRO está no código novo — não ajuste os números abaixo.
 */

// Os padrões do commit f81ad5e, congelados AQUI. Não importe DEFAULT_PARAMS: ele muda.
const V1 = {
  prazoObraMeses: 36, vacanciaMesesAno: 1, iptuPctAno: 0.6, iptuPagador: 'inquilino',
  condominioPctAno: 2, condominioPagador: 'inquilino', taxaAdmPct: 8, manutencaoPctAno: 0.5,
  itbiPct: 3, escrituraPct: 0.5, registroPct: 0.5, descontoAVista: 5, corretagemVendaPct: 6,
  impostoVendaPct: 6.73, anoTransicao: 10, pctPagoChaves: 70, jurosFinHolding: 0.8,
  impostoHolding: 11.5, rate: 0.8, dissidio: 5, mesDissidio: 8, incc: 6, depreciacao: 1.5,
  dividaApe: 400_000, salarioBrutoCasal: 34_000, parcelaApeAtual: 4_000, monthlyAmount: 2_000,
  annualAmount: 96_000, annualMonth: 12, initial: 75_000, custoStudio: 260_000, years: 15,
}

const SEM_CUSTOS = {
  vacanciaMesesAno: 0, iptuPctAno: 0, condominioPctAno: 0, taxaAdmPct: 0, manutencaoPctAno: 0,
  itbiPct: 0, escrituraPct: 0, registroPct: 0, descontoAVista: 0,
}

const params = (over: object = {}) => ({ ...V1, ...NEUTRO, ...over }) as unknown as PlannerParams

const CENARIOS: Record<string, PlannerParams> = {
  padrao15: params(),
  venda: params({
    ...SEM_CUSTOS, initial: 260_000, custoStudio: 260_000, pctPagoChaves: 50, jurosFinHolding: 0,
    monthlyAmount: 15_000, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0,
    corretagemVendaPct: 0, impostoVendaPct: 0, rate: 0, incc: 15, depreciacao: 10, years: 8,
  }),
  fgts: params({
    ...SEM_CUSTOS, dividaApe: 50_000, parcelaApeAtual: 1_000, salarioBrutoCasal: 60_000,
    monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 10,
  }),
}

const CAMPOS = [
  'aporteMensal', 'aporteAnual', 'abatimentoApeFgts', 'compraAVistaFgts', 'saldoFgts',
  'imoveisEmConstrucao', 'imoveisAlugados', 'imoveisQuitados', 'imoveisFinanciados', 'totalImoveis',
  'totalParcelasFinanciamento', 'aluguelRecebido', 'comprasImoveis', 'documentacao', 'saldo',
  'custosImovel', 'rendaMensalLiquida', 'vendas', 'valorVendas', 'patrimonioLiquido',
] as const
type Campo = (typeof CAMPOS)[number]

const CONTAGENS: Campo[] = ['imoveisEmConstrucao', 'imoveisAlugados', 'imoveisQuitados', 'imoveisFinanciados', 'totalImoveis', 'vendas']

// Valores do motor f81ad5e, na ordem de CAMPOS, com UMA correção (2026-11-12): o motor antigo deixava
// um resíduo de ponto flutuante no saldo financiado (s - 48 × s/48 ≠ 0) e, em alguns casos, cobrava uma
// 49ª parcela fantasma e planejava com ela. Zerado o resíduo, o motor antigo e o novo são idênticos em
// todas as linhas dos três cenários (verificado). Diferença no cenário padrão: patrimônio R$ 4.685.700 → 4.693.638.
const ULTIMA: Record<string, { mes: number; v: number[] }> = {
  padrao15: { mes: 180, v: [0, 0, 0, 0, 430585, 2, 8, 7, 1, 10, 4526, 32772, 12793, 731, 14876, 9059, 23712, 0, 0, 4693638] },
  venda: { mes: 96, v: [15000, 0, 0, 0, 0, 0, 4, 1, 3, 4, 19570, 0, 0, 0, 512745, 0, 0, 0, 0, 2455967] },
  fgts: { mes: 120, v: [1000, 0, 0, 0, 53777, 0, 2, 2, 0, 2, 0, 7162, 0, 0, 78720, 824, 6338, 0, 0, 973986] },
}
const SOMAS: Record<string, number[]> = {
  padrao15: [519222, 1267853, 400001, 0, 20015590, 293, 753, 407, 346, 1046, 1190121, 2478385, 2246934, 128399, 4109475, 685125, 1793254, 0, 0, 349116147],
  venda: [1440000, 0, 0, 0, 0, 176, 192, 28, 164, 368, 705825, 0, 974832, 0, 23522732, 0, 0, 2, 753396, 118723473],
  fgts: [97000, 0, 50000, 587516, 15102560, 0, 69, 69, 0, 69, 0, 215593, 209079, 0, 5335943, 24796, 190801, 0, 0, 33081620],
}

describe('caracterização do motor f81ad5e (parâmetros novos no valor neutro)', () => {
  for (const nome of Object.keys(CENARIOS)) {
    it(`${nome}: última linha e soma de cada campo`, () => {
      const linhas: MonthRow[] = simulateMonthly(CENARIOS[nome])
      const ultima = linhas.at(-1)!
      expect(ultima.mes, `${nome}: mês final`).toBe(ULTIMA[nome].mes)
      CAMPOS.forEach((c, i) => {
        const esperado = ULTIMA[nome].v[i]
        if (CONTAGENS.includes(c)) expect(ultima[c], `${nome} última ${c}`).toBe(esperado)
        else expect(Math.abs(ultima[c] - esperado), `${nome} última ${c}: ${ultima[c]} x ${esperado}`).toBeLessThanOrEqual(2)
        const soma = linhas.reduce((a, l) => a + l[c], 0)
        const tol = CONTAGENS.includes(c) ? 0 : linhas.length
        expect(Math.abs(soma - SOMAS[nome][i]), `${nome} soma ${c}: ${soma} x ${SOMAS[nome][i]}`).toBeLessThanOrEqual(tol)
      })
    })
  }
})
