import { describe, expect, it } from 'vitest'
import { simulateMonthly } from './calc'
import { NEUTRO } from './neutro'
import { contaTemporada } from './temporada'
import { DEFAULT_PARAMS, type MonthRow, type PlannerParams } from './types'
import { dataDoMes } from './calendario'
import { carta } from './consorcio'

// Recursos criados depois do commit f81ad5e. Os testes de mecânica antigos estão em calc.test.ts.
const SEM_CUSTOS: Partial<PlannerParams> = {
  vacanciaMesesAno: 0, iptuPctAno: 0, condominioPctAno: 0, taxaAdmPct: 0, manutencaoPctAno: 0,
  itbiPct: 0, escrituraPct: 0, registroPct: 0, descontoAVista: 0,
}
const LEGADO: Partial<PlannerParams> = { rate: 0.8, incc: 6, depreciacao: 1.5, jurosFinHolding: 0.8, pctPagoChaves: 70 }
const base = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...LEGADO, ...SEM_CUSTOS, ...NEUTRO, ...over })
const soAporte = (over: Partial<PlannerParams> = {}) => base({
  initial: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 10, ...over,
})
const soUmaUnidade = (over: Partial<PlannerParams> = {}) => base({
  monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 8, ...over,
})
const minSaldo = (l: MonthRow[]) => Math.min(...l.map((x) => x.saldo))
const soma = (l: MonthRow[], c: keyof MonthRow) => l.reduce((a, x) => a + (x[c] as number), 0)

describe('calendário no motor', () => {
  const inicio = { ano: 2026, mes: 11 }
  it('o aporte anual cai no mês escolhido do calendário, não no 12º mês do plano', () => {
    const l = simulateMonthly(soAporte({ annualAmount: 50_000, annualMonth: 12, years: 3 }), inicio)
    expect(l.filter((x) => x.aporteAnual > 0).map((x) => x.mes)).toEqual([2, 14, 26])
  })
  it('o dissídio cai no mês do calendário', () => {
    const l = simulateMonthly(soAporte({ monthlyAmount: 2_000, dissidio: 5, mesDissidio: 8, years: 2 }), inicio)
    expect(l[8].aporteMensal).toBe(2_000)
    expect(l[9].aporteMensal).toBe(2_100)
  })
  it('as linhas trazem o ano civil', () => {
    const l = simulateMonthly(soAporte({ years: 2 }), inicio)
    expect([l[0].ano, l[0].mesDoAno, l[2].ano, l[2].mesDoAno]).toEqual([2026, 11, 2027, 1])
  })
})

describe('viver da renda depois da transição', () => {
  const vive = (over: Partial<PlannerParams> = {}) => base({ aposTransicao: 'vive_da_renda', anoTransicao: 5, years: 15, metaRendaHoje: 8_000, ...over })
  it('no modo reinveste não há retirada nem parcela de apê paga', () => {
    const l = simulateMonthly(base({ aposTransicao: 'reinveste', metaRendaHoje: 8_000, anoTransicao: 5 }))
    expect(l.every((x) => x.retirada === 0 && x.parcelaApePaga === 0)).toBe(true)
  })
  it('retira a meta, limitada ao que a renda deixa', () => {
    const l = simulateMonthly(vive())
    expect(l.slice(0, 60).every((x) => x.retirada === 0)).toBe(true)
    const depois = l.slice(60)
    expect(depois.some((x) => x.retirada > 0)).toBe(true)
    for (const x of depois) {
      expect(x.retirada).toBeLessThanOrEqual(x.metaDoMes + 1)
      expect(x.retirada).toBeLessThanOrEqual(Math.max(0, x.rendaDisponivel) + 1)
    }
  })
  it('termina com menos patrimônio que reinvestir tudo; meta maior, menos ainda', () => {
    const reinveste = simulateMonthly(vive({ aposTransicao: 'reinveste' })).at(-1)!
    const v8 = simulateMonthly(vive()).at(-1)!
    const v16 = simulateMonthly(vive({ metaRendaHoje: 16_000 })).at(-1)!
    expect(v8.patrimonioLiquido).toBeLessThan(reinveste.patrimonioLiquido)
    expect(v16.patrimonioLiquido).toBeLessThanOrEqual(v8.patrimonioLiquido)
  })
  it('meta inalcançável: tudo que sobra vai para a família e o caixa não fica negativo', () => {
    const l = simulateMonthly(vive({ metaRendaHoje: 5_000_000 }))
    for (const x of l.slice(60)) expect(Math.abs(x.retirada - Math.max(0, x.rendaDisponivel))).toBeLessThanOrEqual(2)
    expect(minSaldo(l)).toBeGreaterThanOrEqual(0)
  })
  it('sem trabalho não há depósito de FGTS, mas o saldo continua rendendo', () => {
    const p = { dividaApe: 0, custoStudio: 50_000_000, initial: 0, monthlyAmount: 0, annualAmount: 0, salarioBrutoCasal: 34_000 }
    const v = simulateMonthly(vive(p))
    const r = simulateMonthly(vive({ ...p, aposTransicao: 'reinveste' }))
    const taxa = Math.pow(1.055, 1 / 12)
    expect(v[70].saldoFgts / v[69].saldoFgts).toBeCloseTo(taxa, 3)
    expect(r[70].saldoFgts / r[69].saldoFgts).toBeGreaterThan(taxa + 0.0005)
  })
  it('depois da transição a parcela do apê sai do caixa', () => {
    const p = { dividaApe: 5_000_000, parcelaApeAtual: 4_000, prazoApeMeses: 0 }
    const v = simulateMonthly(vive(p))
    expect(v.slice(0, 60).every((x) => x.parcelaApePaga === 0)).toBe(true)
    expect(v[70].parcelaApePaga).toBeGreaterThan(0)
    expect(simulateMonthly(vive({ ...p, aposTransicao: 'reinveste' })).every((x) => x.parcelaApePaga === 0)).toBe(true)
  })
  it('o caixa nunca fica negativo com os padrões, em 15 e em 25 anos', () => {
    expect(minSaldo(simulateMonthly({ ...DEFAULT_PARAMS }))).toBeGreaterThanOrEqual(0)
    expect(minSaldo(simulateMonthly({ ...DEFAULT_PARAMS, years: 25 }))).toBeGreaterThanOrEqual(0)
  })
})

describe('apê em SAC', () => {
  const ape = (over: Partial<PlannerParams> = {}) => base({
    dividaApe: 400_000, parcelaApeAtual: 4_000, prazoApeMeses: 300, salarioBrutoCasal: 0, monthlyAmount: 1_000,
    annualAmount: 0, dissidio: 0, initial: 0, custoStudio: 50_000_000, years: 3, ...over,
  })
  it('a tabela do banco, mês a mês, e a queda da parcela vira aporte', () => {
    const l = simulateMonthly(ape())
    const quase = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    quase(l[0].saldoApe, 398_667); quase(l[0].parcelaApe, 4_000); quase(l[0].aporteMensal, 1_000)
    quase(l[1].saldoApe, 397_333); quase(l[1].parcelaApe, 3_991); quase(l[1].aporteMensal, 1_009)
    quase(l[2].saldoApe, 396_000); quase(l[2].parcelaApe, 3_982); quase(l[2].aporteMensal, 1_018)
  })
  it('saldo e parcela nunca sobem', () => {
    const l = simulateMonthly(ape({ years: 5 }))
    for (let i = 1; i < l.length; i++) {
      expect(l[i].saldoApe).toBeLessThanOrEqual(l[i - 1].saldoApe)
      expect(l[i].parcelaApe).toBeLessThanOrEqual(l[i - 1].parcelaApe)
    }
  })
  it('com salário (FGTS) o apê quita antes do que só com o FGTS', () => {
    const primeiro = (p: Partial<PlannerParams>) => simulateMonthly(ape({ salarioBrutoCasal: 34_000, years: 12, ...p })).find((x) => x.saldoApe === 0)?.mes ?? 999
    expect(primeiro({ prazoApeMeses: 300 })).toBeLessThan(primeiro({ prazoApeMeses: 0 }))
  })
  it('parcela menor que a amortização: taxa zero e nada de NaN', () => {
    const l = simulateMonthly(ape({ parcelaApeAtual: 1_000 }))
    expect(l.every((x) => Number.isFinite(x.saldoApe) && Number.isFinite(x.parcelaApe))).toBe(true)
    expect(l[0].saldoApe).toBeCloseTo(400_000 - 400_000 / 300, -1)
  })
  it('depois de quitado, a parcela inteira vira aporte', () => {
    const l = simulateMonthly(ape({ dividaApe: 3_000, parcelaApeAtual: 100, prazoApeMeses: 3, years: 1 }))
    const q = l.findIndex((x) => x.saldoApe === 0)
    expect(q).toBeGreaterThanOrEqual(0)
    expect(l[q + 1].aporteMensal).toBe(1_000 + 100)
  })
})

describe('entrega do 1º studio', () => {
  it('em construção até um mês antes da entrega, alugado a partir dela', () => {
    const l = simulateMonthly(soUmaUnidade({ mesesEntrega1o: 12, prazoObraMeses: 48 }))
    expect(l[10].imoveisEmConstrucao).toBe(1)
    expect(l[11].imoveisAlugados).toBe(1)
  })
  it('já entregue: aluga desde o primeiro mês', () => {
    const l = simulateMonthly(soUmaUnidade({ mesesEntrega1o: 0 }))
    expect(l[0].imoveisAlugados).toBe(1)
    expect(l[0].aluguelRecebido).toBeGreaterThan(0)
  })
})

describe('montagem e tempo até alugar', () => {
  const uma = (over: Partial<PlannerParams> = {}) => soUmaUnidade({ years: 5, ipca: 0, impostoHolding: 0, ...over })
  it('sem inquilino durante o tempo até alugar, mas a parcela corre', () => {
    const l = simulateMonthly(uma({ mesesAteAlugar: 2 }))
    expect([l[35].aluguelRecebido, l[36].aluguelRecebido]).toEqual([0, 0])
    expect(l[37].aluguelRecebido).toBeGreaterThan(0)
    expect(l[35].totalParcelasFinanciamento).toBeGreaterThan(0)
  })
  it('nesse período IPTU e condomínio são do dono, mesmo com o inquilino pagando', () => {
    const l = simulateMonthly(uma({ mesesAteAlugar: 2, iptuPctAno: 1.2, condominioPctAno: 2.4 }))
    const valor = 260_000 * Math.pow(1.06, 3)
    expect(l[35].custosImovel).toBeCloseTo((valor * 0.036) / 12, -1)
    expect(l[37].custosImovel).toBe(0)
  })
  it('a montagem sai nas chaves, corrigida pelo IPCA, e é gasto (não patrimônio)', () => {
    const l = simulateMonthly(uma({ custoMontagem: 10_000, ipca: 5 }))
    expect(l.filter((x) => x.montagem > 0).map((x) => x.mes)).toEqual([36])
    expect(Math.abs(l[35].montagem - 10_000 * Math.pow(1.05, 3))).toBeLessThanOrEqual(1)
    expect(l.at(-1)!.patrimonioLiquido).toBeLessThan(simulateMonthly(uma({ ipca: 5 })).at(-1)!.patrimonioLiquido)
  })
  it('compra com FGTS também paga a montagem, sem estourar o caixa', () => {
    const p = base({ dividaApe: 50_000, parcelaApeAtual: 1_000, salarioBrutoCasal: 60_000, monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 10, custoMontagem: 20_000 })
    const l = simulateMonthly(p)
    const compra = l.find((x) => x.compraAVistaFgts > 0)!
    expect(compra.montagem).toBeGreaterThan(0)
    expect(compra.saldo).toBeGreaterThanOrEqual(0)
  })
})

describe('rendimento do caixa', () => {
  const parado = (over: Partial<PlannerParams> = {}) => soAporte({ monthlyAmount: 10_000, custoStudio: 50_000_000, years: 1, ...over })
  it('o caixa parado rende', () => {
    const l = simulateMonthly(parado({ rendimentoCaixaAno: 12 }))
    expect(l[0].rendimentoCaixa).toBe(0)
    expect(Math.abs(l[1].rendimentoCaixa - 95)).toBeLessThanOrEqual(1)
    expect(l[11].saldo).toBeGreaterThan(120_000)
  })
  it('rendimento maior nunca deixa menos patrimônio', () => {
    const a = simulateMonthly({ ...DEFAULT_PARAMS, rendimentoCaixaAno: 0 }).at(-1)!
    const b = simulateMonthly({ ...DEFAULT_PARAMS, rendimentoCaixaAno: 8 }).at(-1)!
    expect(b.patrimonioLiquido).toBeGreaterThanOrEqual(a.patrimonioLiquido)
  })
  it('automático guarda a sobra quando o caixa rende mais que a obra', () => {
    const p = soAporte({ monthlyAmount: 10_000, rendimentoCaixaAno: 10, incc: 6, jurosFinHolding: 0 })
    const auto = simulateMonthly({ ...p, sobraDoCaixa: 'automatico' })
    const adianta = simulateMonthly({ ...p, sobraDoCaixa: 'adianta_obra' })
    const antesDeAlugar = (l: MonthRow[]) => {
      const fim = l.findIndex((x) => x.imoveisAlugados > 0)
      return soma(l.slice(0, fim), 'comprasImoveis')
    }
    expect(antesDeAlugar(adianta)).toBeGreaterThan(0)
    expect(antesDeAlugar(auto)).toBeLessThan(antesDeAlugar(adianta))
  })
  it('automático com rendimento menor que a obra faz o mesmo que adiantar', () => {
    const p = soAporte({ monthlyAmount: 10_000, rendimentoCaixaAno: 2, incc: 6, jurosFinHolding: 0 })
    const auto = simulateMonthly({ ...p, sobraDoCaixa: 'automatico' })
    const adianta = simulateMonthly({ ...p, sobraDoCaixa: 'adianta_obra' })
    expect(auto.map((x) => x.patrimonioLiquido)).toEqual(adianta.map((x) => x.patrimonioLiquido))
  })
})

describe('custo fixo da holding', () => {
  it('cobrado todo mês, corrigido pelo IPCA, e só depois da primeira unidade', () => {
    const fixo = simulateMonthly(soUmaUnidade({ custoFixoHoldingMes: 1_000, ipca: 0, years: 2 }))
    expect(fixo.every((x) => x.custoFixoHolding === 1_000)).toBe(true)
    expect(simulateMonthly(soUmaUnidade({ custoFixoHoldingMes: 1_000, ipca: 6, years: 2 }))[11].custoFixoHolding).toBe(1_060)
    const sem = simulateMonthly(soAporte({ initial: 0, monthlyAmount: 12_000, custoFixoHoldingMes: 500, ipca: 0, years: 6 }))
    const primeira = sem.findIndex((x) => x.totalImoveis > 0)
    expect(sem.slice(0, primeira).every((x) => x.custoFixoHolding === 0)).toBe(true)
    expect(sem[primeira + 1].custoFixoHolding).toBe(500)
  })
  it('desconta da renda disponível e do patrimônio', () => {
    const a = simulateMonthly(soUmaUnidade({ custoFixoHoldingMes: 0, years: 5 })).at(-1)!
    const b = simulateMonthly(soUmaUnidade({ custoFixoHoldingMes: 1_000, years: 5 })).at(-1)!
    expect(b.patrimonioLiquido).toBeLessThan(a.patrimonioLiquido)
    expect(b.rendaDisponivel).toBeLessThan(a.rendaDisponivel)
  })
})

describe('correção da obra', () => {
  const uma = (over: Partial<PlannerParams> = {}) => soUmaUnidade({ years: 6, ...over })
  it('"igual ao INCC" é o motor de sempre; um valor próprio igual ao INCC dá o mesmo diário', () => {
    const a = simulateMonthly(uma({ correcaoObraModo: 'incc' }))
    const b = simulateMonthly(uma({ correcaoObraModo: 'propria', correcaoObraAno: 6 }))
    expect(b.map((x) => x.patrimonioLiquido)).toEqual(a.map((x) => x.patrimonioLiquido))
  })
  it('correção maior: dívida e parcelas maiores, patrimônio menor', () => {
    const baixa = simulateMonthly(uma({ correcaoObraModo: 'propria', correcaoObraAno: 0 }))
    const alta = simulateMonthly(uma({ correcaoObraModo: 'propria', correcaoObraAno: 12 }))
    expect(soma(alta, 'totalParcelasFinanciamento')).toBeGreaterThan(soma(baixa, 'totalParcelasFinanciamento'))
    expect(alta[40].patrimonioLiquido).toBeLessThan(baixa[40].patrimonioLiquido)
  })
  it('o caixa não fica negativo com correção própria', () => {
    for (const p of [{ ...DEFAULT_PARAMS }, soAporte({ monthlyAmount: 10_000, correcaoObraModo: 'propria' as const, correcaoObraAno: 9 })]) {
      expect(minSaldo(simulateMonthly(p))).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('cronograma do contrato', () => {
  const contrato = (over: Partial<PlannerParams> = {}) => soAporte({
    cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 0, monthlyAmount: 5_000,
    sobraDoCaixa: 'automatico', rendimentoCaixaAno: 20, years: 8, ...over,
  })
  it('paga a entrada no ato e as mensais até as chaves, e a documentação só nas chaves', () => {
    const l = simulateMonthly(contrato({ itbiPct: 3, escrituraPct: 0.5, registroPct: 0.5 }))
    const m0 = l.findIndex((x) => x.totalImoveis > 0)
    const chaves = l.findIndex((x, i) => i > m0 && x.imoveisAlugados > 0)
    const r = chaves - m0
    expect(r).toBeGreaterThan(0)
    const P = 260_000 * Math.pow(1.06, (m0 + 1) / 12)
    expect(Math.abs(l[m0].comprasImoveis - 0.1 * P) / P).toBeLessThan(0.01)
    if (r > 1) expect(Math.abs(l[m0 + 1].comprasImoveis - (0.25 * P) / r) / P).toBeLessThan(0.01)
    expect(l.slice(m0, chaves).every((x) => x.documentacao === 0)).toBe(true)
    expect(l[chaves].documentacao).toBeGreaterThan(0)
  })
  it('depois das chaves paga exatamente posChavesMeses parcelas e fica quitada', () => {
    const l = simulateMonthly(base({
      cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 0, initial: 100_000, mesesEntrega1o: 6,
      posChavesMeses: 12, monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 2,
    }))
    expect(l.filter((x) => x.totalParcelasFinanciamento > 0)).toHaveLength(12)
    expect(Math.abs(soma(l, 'totalParcelasFinanciamento') - 160_000)).toBeLessThanOrEqual(12)
    expect(l.at(-1)!.imoveisQuitados).toBe(1)
  })
  it('sem juros: a soma das parcelas depois das chaves é o saldo corrigido', () => {
    const l = simulateMonthly(base({
      cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 0, jurosFinHolding: 5, initial: 100_000,
      mesesEntrega1o: 6, posChavesMeses: 12, monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, years: 2,
    }))
    expect(Math.abs(soma(l, 'totalParcelasFinanciamento') - 160_000)).toBeLessThanOrEqual(12) // juros do campo são ignorados
  })
  it('o caixa não fica negativo e a contagem de imóveis fecha', () => {
    const l = simulateMonthly({ ...DEFAULT_PARAMS })
    expect(minSaldo(l)).toBeGreaterThanOrEqual(0)
    expect(l.every((x) => x.totalImoveis === x.imoveisEmConstrucao + x.imoveisAlugados)).toBe(true)
  })
  it('a identidade do saldo fecha com todos os termos', () => {
    const l = simulateMonthly({ ...DEFAULT_PARAMS, years: 15 })
    let anterior = 0
    for (const x of l) {
      const mov = x.aporteMensal + x.aporteAnual + x.aluguelRecebido + x.valorVendas + x.rendimentoCaixa
        - x.custosImovel - x.totalParcelasFinanciamento - x.comprasImoveis - x.documentacao - x.montagem
        - x.custoFixoHolding - x.retirada - x.parcelaApePaga - x.amortizacaoExtra - x.parcelasConsorcio - x.lanceConsorcio
      expect(Math.abs(x.saldo - anterior - mov), `mês ${x.mes}`).toBeLessThanOrEqual(12)
      anterior = x.saldo
    }
  })
})

describe('reserva mínima', () => {
  const plano = (reservaMeses: number) => simulateMonthly(base({
    cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 6.66, initial: 0, annualAmount: 0, dissidio: 0,
    dividaApe: 0, salarioBrutoCasal: 0, monthlyAmount: 15_000, years: 10, reservaMeses,
  }))
  it('reserva 0 é o comportamento de sempre (o teste de caracterização cobre); reserva maior compra menos cedo', () => {
    const r0 = plano(0)
    const r6 = plano(6)
    expect(r6[59].totalImoveis).toBeLessThanOrEqual(r0[59].totalImoveis)
    const primeira = r0.findIndex((x) => x.comprasImoveis > 0)
    expect(Math.min(...r6.slice(primeira).map((x) => x.saldo))).toBeGreaterThanOrEqual(Math.min(...r0.slice(primeira).map((x) => x.saldo)))
  })
  it('o caixa não fica negativo e a reserva não impede o aporte', () => {
    expect(minSaldo(plano(3))).toBeGreaterThanOrEqual(0)
    const inviavel = (m: number) => simulateMonthly(base({ custoStudio: 50_000_000, monthlyAmount: 1_000, years: 2, reservaMeses: m }))
    expect(inviavel(0).map((x) => x.saldo)).toEqual(inviavel(12).map((x) => x.saldo))
  })
  it('obrigacoesMes é zero antes da primeira compra e maior ou igual às parcelas', () => {
    const l = plano(3)
    expect(l[0].obrigacoesMes).toBe(0)
    expect(l.every((x) => x.obrigacoesMes >= x.totalParcelasFinanciamento)).toBe(true)
    expect(l.some((x) => x.parcelasObra > 0)).toBe(true)
  })
})

describe('temporada no motor', () => {
  const unidadeQuitada = (over: Partial<PlannerParams> = {}) => base({
    initial: 260_000, custoStudio: 260_000, pctPagoChaves: 100, monthlyAmount: 0, annualAmount: 0, dissidio: 0,
    dividaApe: 0, salarioBrutoCasal: 0, impostoHolding: 0, years: 4, ipca: 0, ...over,
  })
  const renda40 = (over: Partial<PlannerParams> = {}) => simulateMonthly(unidadeQuitada(over))[39].rendaMensalLiquida
  it('100% em temporada: a renda é a da conta da temporada', () => {
    const p = unidadeQuitada({ pctTemporada: 100 })
    const valor = 260_000 * Math.pow(1.06, 3) * Math.pow(1 + (6 - 1.5) / 100, 4 / 12)
    expect(Math.abs(renda40({ pctTemporada: 100 }) - contaTemporada(valor, 40, p).liquido)).toBeLessThanOrEqual(3)
  })
  it('50% é a média dos dois modos', () => {
    const meio = renda40({ pctTemporada: 50 })
    expect(Math.abs(meio - (renda40({ pctTemporada: 0 }) + renda40({ pctTemporada: 100 })) / 2)).toBeLessThanOrEqual(3)
  })
  it('em temporada vacância e imobiliária não pesam; a ocupação pesa', () => {
    expect(renda40({ pctTemporada: 100, vacanciaMesesAno: 3, taxaAdmPct: 10 })).toBe(renda40({ pctTemporada: 100 }))
    expect(renda40({ pctTemporada: 100, ocupacaoPct: 80 })).toBeGreaterThan(renda40({ pctTemporada: 100, ocupacaoPct: 30 }))
  })
  it('a montagem de temporada entra na média da montagem', () => {
    const m = (pct: number) => simulateMonthly(soUmaUnidade({ custoMontagem: 10_000, custoMontagemTemporada: 40_000, pctTemporada: pct, ipca: 0, years: 4 })).find((x) => x.montagem > 0)!.montagem
    expect(m(0)).toBe(10_000)
    expect(m(50)).toBe(25_000)
    expect(m(100)).toBe(40_000)
  })
  it('o caixa não fica negativo com 100% em temporada', () => {
    expect(minSaldo(simulateMonthly({ ...DEFAULT_PARAMS, pctTemporada: 100 }))).toBeGreaterThanOrEqual(0)
  })
})

describe('consórcio no motor', () => {
  const cons = (over: Partial<PlannerParams> = {}) => base({
    initial: 0, dissidio: 0, dividaApe: 0, salarioBrutoCasal: 0, annualAmount: 0, descontoAVista: 5, consorcioCotas: 1,
    consorcioPrazoMeses: 200, consorcioTaxaTotalPct: 20, consorcioIntervaloMeses: 24, consorcioLancePct: 25,
    monthlyAmount: 20_000, years: 10, ...over,
  })
  it('a parcela do plano, e o reajuste anual pelo INCC', () => {
    const l = simulateMonthly(cons({ consorcioIntervaloMeses: 300, incc: 6, monthlyAmount: 5_000 }))
    expect(Math.abs(l[0].parcelasConsorcio - 1_482)).toBeLessThanOrEqual(1)
    expect(Math.abs(l[11].parcelasConsorcio - 1_482)).toBeLessThanOrEqual(1)
    expect(Math.abs(l[12].parcelasConsorcio - 1_571)).toBeLessThanOrEqual(1)
  })
  it('sem lance e sem reajuste, as parcelas somam a carta mais a taxa e acabam no prazo', () => {
    const l = simulateMonthly(cons({ consorcioPrazoMeses: 60, incc: 0, consorcioIntervaloMeses: 300, monthlyAmount: 8_000, years: 6 }))
    const carta0 = 260_000 * 0.95
    expect(Math.abs(soma(l, 'parcelasConsorcio') - carta0 * 1.2)).toBeLessThanOrEqual(80)
    expect(l.slice(60).every((x) => x.parcelasConsorcio === 0)).toBe(true)
  })
  it('contempla no mês previsto, paga o lance e a unidade nasce pronta', () => {
    const l = simulateMonthly(cons())
    const m = l.find((x) => x.contemplacoes > 0)!
    expect(m.mes).toBe(24)
    expect(Math.abs(m.lanceConsorcio - 0.25 * carta(24, cons()))).toBeLessThanOrEqual(2)
    expect(m.imoveisAlugados).toBeGreaterThanOrEqual(1)
    expect(l.filter((x) => x.parcelasConsorcio > 0).length).toBeLessThan(200)
  })
  it('sem caixa para o lance, a contemplação espera', () => {
    const l = simulateMonthly(cons({ monthlyAmount: 2_000 }))
    expect(l[23].contemplacoes).toBe(0)
    expect(l[24].contemplacoesAtrasadas).toBeGreaterThan(0)
  })
  it('conservação: consórcio sem taxa, sem reajuste e sem lance não cria nem destrói patrimônio', () => {
    const l = simulateMonthly(cons({
      consorcioTaxaTotalPct: 0, incc: 0, depreciacao: 0, descontoAVista: 0, rate: 0, ipca: 0, jurosFinHolding: 0,
      consorcioLancePct: 0, consorcioIntervaloMeses: 300, monthlyAmount: 5_000, years: 3,
    }))
    for (let i = 0; i < l.length; i++) expect(Math.abs(l[i].patrimonioLiquido - 5_000 * (i + 1))).toBeLessThanOrEqual(3)
  })
  it('duas cotas, duas contemplações', () => {
    const l = simulateMonthly(cons({ consorcioCotas: 2, monthlyAmount: 40_000, years: 6 }))
    expect(l.filter((x) => x.contemplacoes > 0).map((x) => x.mes)).toEqual([24, 48])
  })
  it('a taxa custa patrimônio', () => {
    const com = simulateMonthly(cons({ monthlyAmount: 40_000 })).at(-1)!
    const sem = simulateMonthly(cons({ monthlyAmount: 40_000, consorcioTaxaTotalPct: 0 })).at(-1)!
    expect(com.patrimonioLiquido).toBeLessThan(sem.patrimonioLiquido)
  })
})

describe('ágio do pronto e venda nas chaves', () => {
  it('o ágio dá patrimônio a quem compra na planta, sem mexer na dívida', () => {
    const uma = (agio: number) => simulateMonthly(soUmaUnidade({ agioProntoPct: agio, rate: 0, years: 4 }))
    const sem = uma(0)[39]
    const com = uma(20)[39]
    const valor = 260_000 * Math.pow(1.06, 3) * Math.pow(1 + 4.5 / 100, 4 / 12)
    expect(Math.abs(com.patrimonioLiquido - sem.patrimonioLiquido - 0.2 * valor) / valor).toBeLessThan(0.005)
    expect(uma(20).map((x) => x.totalParcelasFinanciamento)).toEqual(uma(0).map((x) => x.totalParcelasFinanciamento))
  })
  it('o pronto fica mais caro com ágio', () => {
    const p = base({ dividaApe: 50_000, parcelaApeAtual: 1_000, salarioBrutoCasal: 60_000, monthlyAmount: 0, annualAmount: 0, dissidio: 0, initial: 0, years: 10 })
    const c = simulateMonthly({ ...p, agioProntoPct: 20 }).find((x) => x.compraAVistaFgts > 0)!
    const preco = 260_000 * 1.2 * Math.pow(1.06, c.mes / 12)
    expect(Math.abs(c.compraAVistaFgts + c.comprasImoveis - preco)).toBeLessThan(15)
  })
  const chaves = (pct: number, over: Partial<PlannerParams> = {}) => simulateMonthly(soAporte({
    cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 6.66, monthlyAmount: 10_000,
    agioProntoPct: 20, pctVendaNasChaves: pct, years: 8, ...over,
  }))
  it('vender nas chaves gera vendas e libera o caixa', () => {
    const l = chaves(100)
    expect(soma(l, 'vendas')).toBeGreaterThan(0)
    expect(soma(l, 'valorVendas')).toBeGreaterThan(0)
  })
  it('sem ágio e com os atritos padrão, vender nas chaves termina com menos patrimônio', () => {
    const v = chaves(100, { agioProntoPct: 0 }).at(-1)!
    const n = chaves(0, { agioProntoPct: 0 }).at(-1)!
    expect(v.patrimonioLiquido).toBeLessThan(n.patrimonioLiquido)
  })
  it('com atrito de 90% o líquido é negativo: não vende', () => {
    expect(soma(chaves(100, { corretagemVendaPct: 30, impostoVendaPct: 60, agioProntoPct: 0 }), 'vendas')).toBe(0)
  })
  it('contagem fecha e o caixa não fica negativo', () => {
    const l = chaves(100)
    expect(l.every((x) => x.totalImoveis === x.imoveisEmConstrucao + x.imoveisAlugados)).toBe(true)
    expect(minSaldo(l)).toBeGreaterThanOrEqual(0)
  })
})

describe('desempenho', () => {
  it('uma simulação padrão leva bem menos de um segundo', () => {
    const t0 = performance.now()
    simulateMonthly({ ...DEFAULT_PARAMS }, { ano: 2026, mes: 11 })
    expect(performance.now() - t0).toBeLessThan(1_500)
  })
  it('o calendário usado nos testes bate com dataDoMes', () => {
    expect(dataDoMes(1, { ano: 2026, mes: 11 }).ano).toBe(2026)
  })
})

describe('IPCA depois das chaves, studio atual e parcelamento automático', () => {
  const umaComSaldo = (over: Partial<PlannerParams> = {}) => base({
    cronograma: 'contrato', correcaoObraModo: 'propria', correcaoObraAno: 0, correcaoPosChavesAno: 0, initial: 100_000,
    mesesEntrega1o: 6, posChavesMeses: 12, monthlyAmount: 0, annualAmount: 0, dissidio: 0, dividaApe: 0,
    salarioBrutoCasal: 0, years: 2, ...over,
  })
  it('depois das chaves o saldo corre pelo IPCA; antes, pelo índice da obra', () => {
    const sem = soma(simulateMonthly(umaComSaldo()), 'totalParcelasFinanciamento')
    const ipca = soma(simulateMonthly(umaComSaldo({ correcaoPosChavesAno: 12 })), 'totalParcelasFinanciamento')
    expect(Math.abs(sem - 160_000)).toBeLessThanOrEqual(12)
    expect(ipca).toBeGreaterThan(sem * 1.04)
    // a correção da obra só pesa até as chaves: com 20% a.a. por 6 meses o saldo nasce ~9,5% maior e depois não corre
    const obra = soma(simulateMonthly(umaComSaldo({ correcaoObraAno: 20 })), 'totalParcelasFinanciamento')
    expect(Math.abs(obra - 160_000 * Math.pow(1.2, 0.5))).toBeLessThanOrEqual(25)
  })
  it('as parcelas fixa e anual do studio atual saem do caixa e reduzem o saldo depois das chaves', () => {
    const l = simulateMonthly(umaComSaldo({
      mesesEntrega1o: 12, parcelaMensal1o: 1_000, parcelaAnual1o: 20_000, monthlyAmount: 1_000, annualAmount: 20_000, annualMonth: 12, years: 3,
    }))
    expect(l.slice(0, 11).every((x) => x.comprasImoveis === 1_000)).toBe(true)
    expect(l[11].comprasImoveis).toBe(21_000)
    expect(Math.abs(soma(l, 'totalParcelasFinanciamento') - (160_000 - 12_000 - 20_000))).toBeLessThanOrEqual(12)
    expect(minSaldo(l.slice(0, 11))).toBeGreaterThanOrEqual(0) // até as chaves o aporte cobre as parcelas
  })
  it('sem parcelas informadas o studio atual se comporta como antes', () => {
    const a = simulateMonthly(umaComSaldo({ mesesEntrega1o: 12 }))
    expect(soma(a, 'comprasImoveis')).toBe(0)
  })
  it('automático: os reforços aparecem nos meses do bônus, as mensais ficam planas', () => {
    const l = simulateMonthly(soAporte({
      cronograma: 'contrato', parcelamento: 'automatico', correcaoObraModo: 'propria', correcaoObraAno: 0, entradaPct: 10,
      mensaisPct: 40, reforcoPct: 0, chavesPct: 20, monthlyAmount: 5_000, annualAmount: 96_000, annualMonth: 12,
      sobraDoCaixa: 'automatico', rendimentoCaixaAno: 20, years: 8,
    }), { ano: 2026, mes: 1 })
    const m0 = l.findIndex((x) => x.totalImoveis > 0)
    const chaves = l.findIndex((x, i) => i > m0 && x.imoveisAlugados > 0)
    expect(chaves).toBeGreaterThan(m0 + 12)
    const entre = l.slice(m0 + 1, chaves)
    const dezembros = entre.filter((x) => x.mesDoAno === 12)
    const outros = entre.filter((x) => x.mesDoAno !== 12)
    expect(dezembros.length).toBeGreaterThan(0)
    const mensal = outros[0].comprasImoveis
    expect(outros.every((x) => Math.abs(x.comprasImoveis - mensal) <= mensal * 0.02 + 5)).toBe(true)
    expect(dezembros.every((x) => x.comprasImoveis > mensal * 1.5)).toBe(true)
    expect(minSaldo(l)).toBeGreaterThanOrEqual(0)
  })
  it('a reserva aceita qualquer valor de 0 a 12 meses', () => {
    for (const r of [0, 1, 6, 12]) expect(minSaldo(simulateMonthly({ ...DEFAULT_PARAMS, reservaMeses: r, years: 8 }))).toBeGreaterThanOrEqual(0)
  })
})
