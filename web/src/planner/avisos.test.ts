import { describe, expect, it } from 'vitest'
import { avisos } from './avisos'
import { simulateMonthly } from './calc'
import { DEFAULT_PARAMS, type MonthRow, type PlannerParams } from './types'

const inicio = { ano: 2026, mes: 11 }
const ids = (p: Partial<PlannerParams> = {}, linhas?: MonthRow[]) => {
  const params = { ...DEFAULT_PARAMS, ...p }
  return avisos(linhas ?? simulateMonthly(params, inicio), params).map((a) => a.id)
}
const achar = (p: Partial<PlannerParams>, id: string) => {
  const params = { ...DEFAULT_PARAMS, ...p }
  return avisos(simulateMonthly(params, inicio), params).find((a) => a.id === id)
}
const linha = (over: Partial<MonthRow>): MonthRow => ({
  ...simulateMonthly({ ...DEFAULT_PARAMS, years: 1 }, inicio)[0], ...over,
})

describe('avisos', () => {
  it('his-hmp: aparece no preço de HIS/HMP e some acima do teto', () => {
    expect(ids({ custoStudio: 260_000 })).toContain('his-hmp')
    expect(ids({ custoStudio: 800_000 })).not.toContain('his-hmp')
  })
  it('transicao-nao-cobre: só no modo vivo da renda, com o percentual', () => {
    const a = achar({ aposTransicao: 'vive_da_renda', metaRendaHoje: 15_000 }, 'transicao-nao-cobre')
    expect(a?.nivel).toBe('atencao')
    expect(a?.texto).toMatch(/cobre \d+% da sua meta/)
    expect(ids({ aposTransicao: 'reinveste' })).not.toContain('transicao-nao-cobre')
    expect(ids({ metaRendaHoje: 0 })).not.toContain('transicao-nao-cobre')
  })
  it('saldo-negativo: traz o mês/ano da primeira linha negativa e não aparece quando o caixa fecha', () => {
    const quebrado = achar({ initial: 260_000, monthlyAmount: 0, annualAmount: 0, custoFixoHoldingMes: 20_000 }, 'saldo-negativo')
    expect(quebrado?.texto).toMatch(/nov\/2026|dez\/2026|jan\/2027/)
    expect(ids()).not.toContain('saldo-negativo')
  })
  it('spread-negativo: aparece quando a correção passa do retorno e há parcelas depois das chaves', () => {
    expect(ids({ correcaoObraAno: 20 })).toContain('spread-negativo')
    expect(ids({ correcaoObraAno: 6.66 })).not.toContain('spread-negativo')
    expect(ids({ correcaoObraAno: 20, entradaPct: 20, mensaisPct: 40, reforcoPct: 20, chavesPct: 20 })).not.toContain('spread-negativo')
  })
  it('temporada, consórcio e ágio só avisam quando estão ligados', () => {
    expect(ids({ pctTemporada: 0 })).not.toContain('temporada-regras')
    expect(ids({ pctTemporada: 10 })).toContain('temporada-regras')
    expect(ids({ consorcioCotas: 0 })).not.toContain('consorcio-hipotese')
    expect(ids({ consorcioCotas: 1 })).toContain('consorcio-hipotese')
    expect(ids({ agioProntoPct: 0 })).not.toContain('agio-hipotese')
    expect(ids({ agioProntoPct: 15 })).toContain('agio-hipotese')
  })
  it('consorcio-atrasado: carta que não saiu por falta de caixa', () => {
    expect(ids({ consorcioCotas: 1, monthlyAmount: 2_000, annualAmount: 0, initial: 0, years: 6 })).toContain('consorcio-atrasado')
  })
  it('folego-curto e cobertura-baixa saem das linhas do diário', () => {
    const linhas = [
      linha({ mes: 1, comprasImoveis: 40_000, saldo: 5_000, obrigacoesMes: 10_000, rendaMensalLiquida: 3_000, aporteMensal: 2_000 }),
      linha({ mes: 2, saldo: 6_000, obrigacoesMes: 10_000, rendaMensalLiquida: 3_000, aporteMensal: 2_000 }),
    ]
    const a = avisos(linhas, { ...DEFAULT_PARAMS, reservaMeses: 3 })
    expect(a.find((x) => x.id === 'folego-curto')?.nivel).toBe('atencao')
    expect(a.find((x) => x.id === 'cobertura-baixa')?.nivel).toBe('saiba')
    const folgado = avisos([linha({ mes: 1, comprasImoveis: 40_000, saldo: 90_000, obrigacoesMes: 10_000, rendaMensalLiquida: 30_000 })], DEFAULT_PARAMS)
    expect(folgado.map((x) => x.id)).not.toContain('folego-curto')
    expect(folgado.map((x) => x.id)).not.toContain('cobertura-baixa')
  })
  it('os de atenção vêm antes dos de "saiba"', () => {
    const lista = avisos(simulateMonthly({ ...DEFAULT_PARAMS, pctTemporada: 10, correcaoObraAno: 20 }, inicio), { ...DEFAULT_PARAMS, pctTemporada: 10, correcaoObraAno: 20 })
    const niveis = lista.map((a) => a.nivel)
    expect(niveis.indexOf('saiba')).toBeGreaterThan(niveis.lastIndexOf('atencao'))
  })
  it('o aviso de dividendos e de adicional de IRPJ pedem renda alta', () => {
    expect(ids()).not.toContain('dividendos')
    const rico = [linha({ mes: 5, rendaDisponivel: 150_000, aluguelRecebido: 80_000 })]
    const lista = avisos(rico, DEFAULT_PARAMS).map((a) => a.id)
    expect(lista).toContain('dividendos')
    expect(lista).toContain('adicional-irpj')
  })
})
