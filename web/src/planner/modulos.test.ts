import { describe, expect, it } from 'vitest'
import { contaDoAluguel } from './calc'
import { dataDoMes, INICIO_PADRAO, inicioDeHoje, rotuloMesAno } from './calendario'
import { carta, cartaBase, parcelaDaCota, parcelasRestantesAposLance } from './consorcio'
import { cronograma, pctAteChaves, posChavesPct, prazoPosChaves } from './contrato'
import { custoAnualDoCredito, parcelaSac } from './credito'
import { emReaisDeHoje, fatorPreco } from './inflacao'
import { aliquotaConsumoLonga, impostoAluguelLonga, redutorSocial } from './imposto'
import { aplicarReferencias, MERCADO } from './mercado'
import { liquidoVendaNasChaves, precoLancamento, precoNaObra, valorPronto, vendeNasChaves } from './planta'
import { comparaLocacao, contaTemporada } from './temporada'
import { DEFAULT_PARAMS, type PlannerParams } from './types'

const P = (over: Partial<PlannerParams> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...over })

describe('calendário', () => {
  it('o mês 1 é o mês de início, e os meses seguintes viram o ano', () => {
    const i = { ano: 2026, mes: 11 }
    expect(dataDoMes(1, i)).toEqual({ ano: 2026, mesDoAno: 11 })
    expect(dataDoMes(2, i)).toEqual({ ano: 2026, mesDoAno: 12 })
    expect(dataDoMes(3, i)).toEqual({ ano: 2027, mesDoAno: 1 })
    expect(dataDoMes(14, i)).toEqual({ ano: 2027, mesDoAno: 12 })
  })
  it('o início padrão é janeiro de 2026', () => {
    expect(dataDoMes(1, INICIO_PADRAO)).toEqual({ ano: 2026, mesDoAno: 1 })
    expect(dataDoMes(13, INICIO_PADRAO)).toEqual({ ano: 2027, mesDoAno: 1 })
  })
  it('inicioDeHoje lê a data recebida; rotuloMesAno abrevia o mês', () => {
    expect(inicioDeHoje(new Date(2026, 10, 12))).toEqual({ ano: 2026, mes: 11 })
    expect(rotuloMesAno(2038, 3)).toBe('mar/2038')
  })
})

describe('inflação', () => {
  it('fatorPreco compõe ao ano e emReaisDeHoje desfaz', () => {
    expect(fatorPreco(0, 7)).toBe(1)
    expect(fatorPreco(12, 5)).toBeCloseTo(1.05, 10)
    expect(fatorPreco(24, 5)).toBeCloseTo(1.1025, 10)
    expect(emReaisDeHoje(23_716, 180, 4.5)).toBeCloseTo(12_255, -1)
    expect(emReaisDeHoje(1_000, 50, 0)).toBe(1_000)
  })
})

describe('crédito (SAC com correção)', () => {
  it('parcela sem correção', () => {
    const x = parcelaSac(100_000, 100, 0.01, 0)
    expect(x.amortizacao).toBeCloseTo(1_000, 6)
    expect(x.juros).toBeCloseTo(1_000, 6)
    expect(x.parcela).toBeCloseTo(2_000, 6)
    expect(x.saldoDepois).toBeCloseTo(99_000, 6)
  })
  it('parcela com correção monetária', () => {
    const x = parcelaSac(100_000, 100, 0.01, 0.005)
    expect(x.amortizacao).toBeCloseTo(1_005, 6)
    expect(x.juros).toBeCloseTo(1_005, 6)
    expect(x.parcela).toBeCloseTo(2_010, 6)
    expect(x.saldoDepois).toBeCloseTo(99_495, 6)
  })
  it('última parcela quita tudo', () => {
    const x = parcelaSac(5_000, 1, 0.01, 0)
    expect(x.amortizacao).toBe(5_000)
    expect(x.juros).toBeCloseTo(50, 6)
    expect(x.saldoDepois).toBe(0)
  })
  it('custo anual composto', () => {
    expect(custoAnualDoCredito(1, 4.5)).toBeCloseTo(17.75, 1)
    expect(custoAnualDoCredito(0.8, 0)).toBeCloseTo(10.03, 1)
    expect(custoAnualDoCredito(0, 6.66)).toBeCloseTo(6.66, 6)
  })
})

describe('imposto do aluguel (reforma tributária)', () => {
  const reforma = P({ impostoModo: 'reforma', ipca: 0 })
  it('alíquota por ano', () => {
    expect([2025, 2026, 2027, 2028, 2029, 2032, 2033, 2040].map(aliquotaConsumoLonga)).toEqual([3.65, 3.65, 3.39, 3.39, 3.89, 5.39, 8.4, 8.4])
  })
  it('redutor social corrigido pelo IPCA a partir de 2027', () => {
    expect(redutorSocial(2026, 4.5)).toBe(0)
    expect(redutorSocial(2027, 4.5)).toBe(600)
    expect(redutorSocial(2029, 4.5)).toBeCloseTo(655.22, 1)
  })
  it('exemplos de conferência', () => {
    const ex: [number, number, number][] = [
      [1560, 2026, 176.75], [1560, 2027, 152.35], [1560, 2029, 157.15], [1560, 2033, 200.45],
      [3000, 2026, 339.9], [3000, 2027, 311.76], [3000, 2029, 323.76], [3000, 2033, 432],
      [500, 2026, 56.65], [500, 2027, 38.4], [500, 2033, 38.4],
    ]
    for (const [aluguel, ano, esperado] of ex) expect(impostoAluguelLonga(aluguel, 1, ano, reforma), `${aluguel} em ${ano}`).toBeCloseTo(esperado, 1)
  })
  it('a vacância reduz o imposto na proporção; o modo fixo ignora o ano', () => {
    expect(impostoAluguelLonga(1560, 11 / 12, 2027, reforma)).toBeCloseTo((11 / 12) * impostoAluguelLonga(1560, 1, 2027, reforma), 6)
    const fixo = P({ impostoModo: 'fixo', impostoHolding: 11.5 })
    expect(impostoAluguelLonga(1560, 1, 2026, fixo)).toBeCloseTo(179.4, 6)
    expect(impostoAluguelLonga(1560, 1, 2033, fixo)).toBeCloseTo(179.4, 6)
  })
  it('o imposto de 2033 é maior que o de 2032', () => {
    expect(impostoAluguelLonga(2000, 1, 2033, reforma)).toBeGreaterThan(impostoAluguelLonga(2000, 1, 2032, reforma))
  })
})

describe('temporada', () => {
  const t = P({ diariaHoje: 240, ocupacaoPct: 55, taxaPlataformaPct: 16, taxaGestaoPct: 20, impostoTemporadaPct: 11.5, condominioPctAno: 2, iptuPctAno: 0.6, custoFixoTemporadaMes: 450, manutencaoTemporadaPctAno: 1.5, ipca: 0 })
  it('exemplo de conferência, com e sem gestora', () => {
    const c = contaTemporada(260_000, 0, t)
    expect(c.bruto).toBeCloseTo(4_015, 0)
    expect(c.custos).toBeCloseTo(3_116.98, 0)
    expect(c.liquido).toBeCloseTo(898.02, 0)
    expect(contaTemporada(260_000, 0, { ...t, taxaGestaoPct: 0 }).liquido).toBeCloseTo(1_572.54, 0)
  })
  it('a diária sobe com o IPCA; condomínio e IPTU dependem do valor', () => {
    const c0 = contaTemporada(260_000, 0, { ...t, ipca: 5 })
    const c12 = contaTemporada(260_000, 12, { ...t, ipca: 5 })
    expect(c12.bruto / c0.bruto).toBeCloseTo(1.05, 6)
  })
  it('ocupação maior, líquido maior; sem ocupação, só custos', () => {
    expect(contaTemporada(260_000, 0, { ...t, ocupacaoPct: 70 }).liquido).toBeGreaterThan(contaTemporada(260_000, 0, t).liquido)
    const zero = contaTemporada(260_000, 0, { ...t, ocupacaoPct: 0 })
    expect(zero.bruto).toBe(0)
    expect(zero.liquido).toBeLessThan(0)
  })
  it('em temporada o IPTU é sempre do dono, e a vacância não conta', () => {
    expect(contaTemporada(260_000, 0, { ...t, iptuPagador: 'inquilino' }).liquido).toBeCloseTo(contaTemporada(260_000, 0, { ...t, iptuPagador: 'proprietario' }).liquido, 6)
    expect(contaTemporada(260_000, 0, { ...t, vacanciaMesesAno: 6 }).liquido).toBeCloseTo(contaTemporada(260_000, 0, t).liquido, 6)
  })
  it('ocupação de equilíbrio contra o aluguel tradicional', () => {
    const p = { ...t, rate: 0.6, vacanciaMesesAno: 1, taxaAdmPct: 8, impostoModo: 'fixo' as const, impostoHolding: 11.5, iptuPagador: 'inquilino' as const, condominioPagador: 'inquilino' as const, manutencaoPctAno: 0.5, custoStudio: 260_000 }
    const longa = (v: number) => contaDoAluguel(v, p)
    const c = comparaLocacao(p, longa)
    expect(c.longa.liquido).toBeCloseTo(995.87, 0)
    expect(c.ocupacaoDeEquilibrio).toBeCloseTo(57.4, 0)
    expect(comparaLocacao({ ...p, taxaGestaoPct: 0 }, longa).ocupacaoDeEquilibrio).toBeCloseTo(44.1, 0)
    expect(comparaLocacao({ ...p, taxaPlataformaPct: 90, taxaGestaoPct: 50 }, longa).ocupacaoDeEquilibrio).toBe(Infinity)
  })
})

describe('planta, ágio e venda nas chaves', () => {
  const p = P({ custoStudio: 260_000, incc: 6, agioProntoPct: 20 })
  it('três preços', () => {
    expect(precoLancamento(0, p)).toBe(260_000)
    expect(valorPronto(0, p)).toBeCloseTo(312_000, 6)
    expect(valorPronto(12, p)).toBeCloseTo(330_720, 6)
    expect(precoNaObra(0, 36, 36, p)).toBeCloseTo(260_000, 6)
    expect(precoNaObra(0, 18, 36, p)).toBeCloseTo(286_000, 6)
    expect(precoNaObra(0, 0, 36, p)).toBeCloseTo(312_000, 6)
  })
  it('sem ágio os três preços coincidem', () => {
    const z = P({ agioProntoPct: 0 })
    expect(valorPronto(7, z)).toBe(precoLancamento(7, z))
    expect(precoNaObra(7, 10, 36, z)).toBe(precoLancamento(7, z))
  })
  it('vendeNasChaves distribui as vendas pelas entregas', () => {
    const quais = (pct: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => vendeNasChaves(n, pct))
    expect(quais(100)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(quais(50)).toEqual([2, 4, 6, 8, 10])
    expect(quais(30)).toEqual([4, 7, 10])
    expect(quais(0)).toEqual([])
  })
  it('líquido da venda nas chaves', () => {
    const v = P({ corretagemVendaPct: 6, impostoVendaPct: 6.73 })
    expect(liquidoVendaNasChaves(300_000, 49_189.19, 75_000, v)).toBeCloseTo(300_000 * 0.8727 - 124_189.19, 1)
  })
})

describe('contrato do plano investidor', () => {
  const c = P({ cronograma: 'contrato', entradaPct: 10, mensaisPct: 25, reforcoPct: 15, reforcoCadaMeses: 12, chavesPct: 20, posChavesMeses: 36 })
  it('o exemplo: 36 meses de obra', () => {
    const par = cronograma(36, c)
    expect(par[0]).toEqual({ k: 0, pct: 10, tipo: 'entrada' })
    const mensais = par.filter((x) => x.tipo === 'mensal')
    expect(mensais).toHaveLength(36)
    expect(mensais[0].pct).toBeCloseTo(25 / 36, 10)
    const reforcos = par.filter((x) => x.tipo === 'reforco')
    expect(reforcos.map((x) => x.k)).toEqual([12, 24])
    expect(reforcos.every((x) => Math.abs(x.pct - 7.5) < 1e-9)).toBe(true)
    expect(par.find((x) => x.tipo === 'chaves')).toEqual({ k: 36, pct: 20, tipo: 'chaves' })
    expect(pctAteChaves(c)).toBe(70)
    expect(posChavesPct(c)).toBe(30)
    expect(prazoPosChaves(c)).toBe(36)
  })
  it('soma sempre o que vai até as chaves', () => {
    for (let r = 0; r <= 60; r++) for (const cada of [3, 6, 12, 24]) {
      const soma = cronograma(r, { ...c, reforcoCadaMeses: cada }).reduce((a, x) => a + x.pct, 0)
      expect(soma, `r=${r} cada=${cada}`).toBeCloseTo(70, 9)
    }
  })
  it('pronto paga tudo na hora; sem reforço possível, ele vai para as chaves; r=1', () => {
    expect(cronograma(0, c)).toEqual([{ k: 0, pct: 70, tipo: 'entrada' }])
    expect(cronograma(10, c).find((x) => x.tipo === 'chaves')?.pct).toBe(35)
    expect(cronograma(10, c).some((x) => x.tipo === 'reforco')).toBe(false)
    expect(cronograma(1, c).map((x) => [x.k, x.tipo])).toEqual([[0, 'entrada'], [1, 'mensal'], [1, 'chaves']])
  })
  it('no modo simples vale o pctPagoChaves e 48 meses', () => {
    const s = P({ cronograma: 'simples', pctPagoChaves: 60 })
    expect(pctAteChaves(s)).toBe(60)
    expect(posChavesPct(s)).toBe(40)
    expect(prazoPosChaves(s)).toBe(48)
  })
})

describe('parcelamento automático (mensais × reforços pelo fluxo)', () => {
  const auto = P({ cronograma: 'contrato', parcelamento: 'automatico', entradaPct: 10, mensaisPct: 40, reforcoPct: 0, chavesPct: 20, annualMonth: 12, posChavesMeses: 36 })
  const ctx = { mes: 1, inicio: { ano: 2026, mes: 11 }, aporteMensal: 5_000, aporteAnual: 96_000, mesTransicao: 120 }
  it('os reforços caem no mês do bônus e levam a fatia que o bônus paga', () => {
    const par = cronograma(36, auto, ctx)
    const reforcos = par.filter((x) => x.tipo === 'reforco')
    expect(reforcos.map((x) => x.k)).toEqual([1, 13, 25]) // dezembro de 2026, 2027 e 2028
    // capacidade: 3 bônus de 96.000 contra 36 aportes de 5.000 → 288/468 do parcelado
    const total = reforcos.reduce((a, x) => a + x.pct, 0)
    expect(total).toBeCloseTo(40 * (288_000 / 468_000), 6)
    expect(par.filter((x) => x.tipo === 'mensal').reduce((a, x) => a + x.pct, 0)).toBeCloseTo(40 - total, 6)
  })
  it('soma sempre o que vai até as chaves', () => {
    for (let r = 0; r <= 60; r++) {
      expect(cronograma(r, auto, ctx).reduce((a, x) => a + x.pct, 0), `r=${r}`).toBeCloseTo(70, 9)
    }
  })
  it('sem bônus no caminho, ou sem fluxo, tudo vira mensal', () => {
    expect(cronograma(1, auto, ctx).some((x) => x.tipo === 'reforco')).toBe(false)
    const semFluxo = cronograma(36, auto, { ...ctx, aporteMensal: 0, aporteAnual: 0 })
    expect(semFluxo.some((x) => x.tipo === 'reforco')).toBe(false)
  })
  it('só mensal quando o bônus é zero; só o bônus paga quando o aporte mensal é zero', () => {
    expect(cronograma(36, auto, { ...ctx, aporteAnual: 0 }).some((x) => x.tipo === 'reforco' && x.pct > 0)).toBe(false)
    const soBonus = cronograma(36, auto, { ...ctx, aporteMensal: 0 })
    expect(soBonus.filter((x) => x.tipo === 'reforco').reduce((a, x) => a + x.pct, 0)).toBeCloseTo(40, 6)
  })
  it('sem contexto (ou no modo manual) vale a divisão dos campos', () => {
    expect(cronograma(36, auto).some((x) => x.tipo === 'reforco')).toBe(false)
    const manual = P({ cronograma: 'contrato', parcelamento: 'manual', entradaPct: 10, mensaisPct: 25, reforcoPct: 15, reforcoCadaMeses: 12, chavesPct: 20 })
    expect(cronograma(36, manual, ctx).filter((x) => x.tipo === 'reforco').map((x) => x.k)).toEqual([12, 24])
  })
})

describe('consórcio', () => {
  const p = P({ custoStudio: 260_000, descontoAVista: 5, agioProntoPct: 0, incc: 6, consorcioPrazoMeses: 200, consorcioTaxaTotalPct: 20 })
  it('carta e parcela', () => {
    expect(cartaBase(p)).toBeCloseTo(247_000, 6)
    expect(carta(1, p)).toBeCloseTo(247_000, 6)
    expect(carta(12, p)).toBeCloseTo(247_000, 6)
    expect(carta(13, p)).toBeCloseTo(261_820, 6)
    expect(parcelaDaCota(1, p)).toBeCloseTo(1_482, 6)
    expect(parcelaDaCota(13, p)).toBeCloseTo(1_570.92, 2)
  })
  it('a soma das parcelas sem reajuste é a carta mais a taxa', () => {
    const z = { ...p, incc: 0 }
    let soma = 0
    for (let m = 1; m <= 200; m++) soma += parcelaDaCota(m, z)
    expect(soma).toBeCloseTo(247_000 * 1.2, 4)
  })
  it('o lance encurta o prazo', () => {
    expect(parcelasRestantesAposLance(24, 24 / 200, 65_455, p)).toBe(135)
  })
})

describe('mercado', () => {
  it('aplicarReferencias troca só aluguel, INCC e envelhecimento', () => {
    const antes = P({ rate: 0.8, incc: 6, depreciacao: 1.5, dissidio: 3 })
    const depois = aplicarReferencias(antes)
    expect(depois.rate).toBe(0.65)
    expect(depois.incc).toBe(6.75)
    expect(depois.depreciacao).toBeCloseTo(2.25, 6)
    expect(depois.dissidio).toBe(3)
  })
  it('a média do INCC de 2 anos é a composta de 6,58% e 6,75%', () => {
    expect(MERCADO.inccMedia2anos.valor).toBeCloseTo((Math.sqrt(1.0658 * 1.0675) - 1) * 100, 1)
    for (const r of Object.values(MERCADO)) expect(r.texto.length).toBeGreaterThan(10)
  })
})
