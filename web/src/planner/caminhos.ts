import { simulateMonthly } from './calc'
import type { Inicio } from './calendario'
import { parcelaDaCota } from './consorcio'
import { emReaisDeHoje } from './inflacao'
import { estresse, mesDaMeta } from './indicadores'
import type { MonthRow, PlannerParams } from './types'

/** O dinheiro que sobra todo mês de verdade, a partir do que a pessoa tem hoje. */
export type Margem = {
  /** O salário líquido foi informado? Se não, a margem é o aporte que a pessoa já definiu. */
  informado: boolean
  salarioLiquido: number
  parcelaApe: number
  despesas: number
  /** Líquido − apê − despesas (ou o aporte mensal, se não informado). */
  margemMensal: number
  /** O bônus anual diluído por mês. */
  bonusPorMes: number
  margemTotalMensal: number
  /** Parte do líquido já comprometida (apê + despesas). 0 se não informado. */
  comprometidoPct: number
}

export function margemLivre(p: PlannerParams): Margem {
  const informado = p.salarioLiquidoCasal > 0
  const margemMensal = informado ? p.salarioLiquidoCasal - p.parcelaApeAtual - p.despesasMensais : p.monthlyAmount
  const bonusPorMes = p.annualAmount / 12
  return {
    informado,
    salarioLiquido: p.salarioLiquidoCasal,
    parcelaApe: p.parcelaApeAtual,
    despesas: p.despesasMensais,
    margemMensal,
    bonusPorMes,
    margemTotalMensal: margemMensal + bonusPorMes,
    comprometidoPct: informado ? ((p.parcelaApeAtual + p.despesasMensais) / p.salarioLiquidoCasal) * 100 : 0,
  }
}

export type IdEstrategia = 'construtora' | 'consorcio' | 'leilao' | 'mix'
export type TipoEvento = 'compra' | 'leilao' | 'contemplacao' | 'venda' | 'chaves' | 'fgts' | 'transicao' | 'meta'
export type Evento = { mes: number; ano: number; mesDoAno: number; tipo: TipoEvento; texto: string }

export type ResumoEstrategia = {
  studios: number
  patrimonioFinal: number
  /** Renda disponível no último mês, em reais de hoje. */
  rendaFinal: number
  mesDaMeta: number | null
  picoDivida: number
  menorSaldo: number
  piorFolegoMeses: number | null
}

export type EstrategiaRodada = {
  id: IdEstrategia
  nome: string
  descricao: string
  params: PlannerParams
  linhas: MonthRow[]
  eventos: Evento[]
  resumo: ResumoEstrategia
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function eventosDe(linhas: MonthRow[], p: PlannerParams): Evento[] {
  const out: Evento[] = []
  const add = (l: MonthRow, tipo: TipoEvento, texto: string) => out.push({ mes: l.mes, ano: l.ano, mesDoAno: l.mesDoAno, tipo, texto })
  const mesTransicao = p.anoTransicao * 12 + 1
  const meta = mesDaMeta(linhas)
  let totalAnt = p.initial > 0 ? 1 : 0
  let obraAnt = p.initial > 0 && p.mesesEntrega1o > 0 ? 1 : 0
  for (const l of linhas) {
    if (l.arremates > 0) add(l, 'leilao', `Arremata ${plural(l.arremates, 'studio', 'studios')} em leilão`)
    if (l.contemplacoes > 0) add(l, 'contemplacao', `Consórcio contemplado: ${plural(l.contemplacoes, 'carta vira studio', 'cartas viram studios')}`)
    if (l.vendas > 0) add(l, 'venda', `Vende ${plural(l.vendas, 'studio', 'studios')}`)
    if (obraAnt > l.imoveisEmConstrucao) add(l, 'chaves', `Recebe as chaves de ${plural(obraAnt - l.imoveisEmConstrucao, 'studio', 'studios')}`)
    const novos = l.totalImoveis - totalAnt + l.vendas - l.arremates - l.contemplacoes
    if (novos > 0) {
      if (l.compraAVistaFgts > 0) add(l, 'fgts', `Compra ${plural(novos, 'studio', 'studios')} pronto com o FGTS`)
      else add(l, 'compra', `Compra ${plural(novos, 'studio', 'studios')} na planta`)
    }
    if (l.mes === mesTransicao) add(l, 'transicao', p.aposTransicao === 'vive_da_renda' ? 'Para de trabalhar: passa a viver da renda' : 'Para de aportar: os aluguéis seguem reinvestidos')
    if (meta !== null && l.mes === meta) add(l, 'meta', 'A renda passa a cobrir a sua meta')
    totalAnt = l.totalImoveis
    obraAnt = l.imoveisEmConstrucao
  }
  return out
}

export type LinhaDoRoteiro = {
  ano: number
  anoCalendario: number
  studios: number
  rendaHoje: number
  patrimonioHoje: number
  metaHoje: number
  /** O que aconteceu no ano, agrupado por tipo. */
  destaques: string[]
}

/** Um ponto por ano do plano: onde a pessoa está no fim de cada um e o que fez nele. */
export function roteiroAnual(linhas: MonthRow[], p: PlannerParams): LinhaDoRoteiro[] {
  const eventos = eventosDe(linhas, p)
  const anos = Math.floor(linhas.length / 12)
  const out: LinhaDoRoteiro[] = []
  for (let a = 1; a <= anos; a++) {
    const l = linhas[a * 12 - 1]
    const doAno = eventos.filter((e) => e.mes > (a - 1) * 12 && e.mes <= a * 12)
    const contar = (tipo: TipoEvento) => doAno.filter((e) => e.tipo === tipo).length
    const destaques: string[] = []
    const rotulos: [TipoEvento, string][] = [
      ['compra', 'compra(s) na planta'], ['leilao', 'leilão(ões)'], ['contemplacao', 'contemplação(ões) de consórcio'],
      ['fgts', 'compra(s) com FGTS'], ['venda', 'venda(s)'], ['chaves', 'entrega(s) de chaves'],
    ]
    for (const [tipo, rotulo] of rotulos) if (contar(tipo) > 0) destaques.push(`${contar(tipo)} ${rotulo}`)
    for (const e of doAno) if (e.tipo === 'transicao' || e.tipo === 'meta') destaques.push(e.texto)
    out.push({
      ano: a,
      anoCalendario: l.ano,
      studios: l.totalImoveis,
      rendaHoje: emReaisDeHoje(l.rendaDisponivel, l.mes, p.ipca),
      patrimonioHoje: emReaisDeHoje(l.patrimonioLiquido, l.mes, p.ipca),
      metaHoje: p.metaRendaHoje,
      destaques,
    })
  }
  return out
}

function resumir(linhas: MonthRow[], p: PlannerParams): ResumoEstrategia {
  const f = linhas.at(-1)!
  return {
    studios: f.totalImoveis,
    patrimonioFinal: emReaisDeHoje(f.patrimonioLiquido, linhas.length, p.ipca),
    rendaFinal: emReaisDeHoje(f.rendaDisponivel, linhas.length, p.ipca),
    mesDaMeta: mesDaMeta(linhas),
    picoDivida: Math.max(0, ...linhas.map((l) => l.dividaFinanciamento + l.aPagarObra + l.dividaConsorcio)),
    menorSaldo: Math.min(...linhas.map((l) => l.saldo)),
    piorFolegoMeses: estresse(linhas).piorFolego?.meses ?? null,
  }
}

/** Quantas cotas cabem em ~70% da margem total (parcela + bônus diluído), entre 1 e 10. */
export function cotasSugeridas(p: PlannerParams): number {
  const parcela = parcelaDaCota(1, p)
  if (parcela <= 0) return 1
  const orcamento = 0.7 * margemLivre(p).margemTotalMensal
  return Math.max(1, Math.min(10, Math.floor(orcamento / parcela)))
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** O que o mix de fato fez neste cenário, contado nas linhas — nada de promessa genérica. */
function descricaoDoMix(linhas: MonthRow[], p: PlannerParams): string {
  const leiloes = linhas.reduce((a, l) => a + l.arremates, 0)
  const contemplados = linhas.reduce((a, l) => a + l.contemplacoes, 0)
  const vendas = linhas.reduce((a, l) => a + l.vendas, 0)
  const partes: string[] = []
  partes.push(leiloes > 0 ? `${plural(leiloes, 'leilão', 'leilões')}` : 'nenhum leilão (não compensou esperar o caixa)')
  if (p.consorcioCotas > 0) partes.push(`${plural(contemplados, 'contemplação', 'contemplações')} de consórcio`)
  if (vendas > 0) partes.push(`${plural(vendas, 'venda', 'vendas')}`)
  return `Todo mês o sistema escolhe o que o caixa e as dívidas permitem. Neste cenário: ${partes.join(', ')}; o resto, studios na planta.`
}

export type Caminhos = { estrategias: EstrategiaRodada[]; recomendada: IdEstrategia; porque: string }

export function caminhos(p: PlannerParams, inicio: Inicio): Caminhos {
  const base: PlannerParams = { ...p, consorcioCotas: 0, leilaoAtivo: false, compraNaPlanta: true }
  const melhorDe = <T extends { resumo: ResumoEstrategia }>(xs: T[]): T =>
    [...xs].sort((a, b) => b.resumo.rendaFinal - a.resumo.rendaFinal || b.resumo.patrimonioFinal - a.resumo.patrimonioFinal)[0]
  const rodar = (params: PlannerParams) => { const linhas = simulateMonthly(params, inicio); return { linhas, resumo: resumir(linhas, params) } }

  // Consórcio: se a pessoa não escolheu cotas, testa 1 a 3 e fica com a que mais rende — cota demais
  // sufoca o caixa e a contemplação nunca cabe (o motor não contempla se o caminho do caixa fica negativo).
  const consorcioCom = (c: number): PlannerParams => ({ ...base, consorcioCotas: c, compraNaPlanta: false })
  const opcoesCotas = p.consorcioCotas > 0 ? [p.consorcioCotas] : Array.from({ length: Math.min(3, cotasSugeridas(p)) }, (_, i) => i + 1)
  const melhorConsorcio = melhorDe(opcoesCotas.map((c) => ({ params: consorcioCom(c), ...rodar(consorcioCom(c)) })))
  const cotas = melhorConsorcio.params.consorcioCotas

  const definicoes: { id: IdEstrategia; nome: string; descricao: string; params: PlannerParams }[] = [
    { id: 'construtora', nome: 'Construtora', descricao: 'Studios na planta pelo plano investidor: sem juros, só a correção do INCC e do IPCA.', params: base },
    { id: 'consorcio', nome: 'Consórcio', descricao: `${cotas} cota(s) de consórcio contempladas por lance; cada carta vira um studio pronto à vista.`, params: melhorConsorcio.params },
    { id: 'leilao', nome: 'Leilão', descricao: `Studios prontos arrematados com ${p.leilaoDescontoPct}% de desconto, pagos à vista, depois de reforma e desocupação.`, params: { ...base, compraNaPlanta: false, leilaoAtivo: true } },
  ]
  const rodadas = definicoes.map((d) => (d.id === 'consorcio' ? { ...d, linhas: melhorConsorcio.linhas, resumo: melhorConsorcio.resumo } : { ...d, ...rodar(d.params) }))

  // Mix: o motor decide mês a mês entre planta, leilão e consórcio; aqui só se escolhe, entre poucas
  // combinações de quanto esperar o caixa para o leilão (0 = a planta compra primeiro) e de cotas, a que mais rende.
  const candidatos: PlannerParams[] = [0, 24].map((espera) => ({ ...base, leilaoAtivo: true, leilaoEsperaMeses: espera }))
  candidatos.push({ ...base, consorcioCotas: 1, leilaoAtivo: true, leilaoEsperaMeses: 24 })
  const mix = melhorDe(candidatos.map((params) => ({ params, ...rodar(params) })))
  rodadas.push({
    id: 'mix', nome: 'Mix', params: mix.params, linhas: mix.linhas, resumo: mix.resumo,
    descricao: descricaoDoMix(mix.linhas, mix.params),
  })

  const estrategias: EstrategiaRodada[] = rodadas.map((r) => ({ id: r.id, nome: r.nome, descricao: r.descricao, params: r.params, linhas: r.linhas, resumo: r.resumo, eventos: eventosDe(r.linhas, r.params) }))
  // Quem deixa o caixa negativo em algum mês não fecha com a margem da pessoa: nunca é a recomendada.
  const fecha = (e: EstrategiaRodada) => e.resumo.menorSaldo >= -1
  const ordem = [...estrategias].sort((a, b) => Number(fecha(b)) - Number(fecha(a)) || b.resumo.rendaFinal - a.resumo.rendaFinal || b.resumo.patrimonioFinal - a.resumo.patrimonioFinal)
  const melhor = ordem[0]
  const segunda = ordem[1]
  const motivo: Record<IdEstrategia, string> = {
    construtora: 'a dívida com a construtora não tem juros e o caixa vira obra adiantada, então cada real compra mais studio',
    consorcio: 'o consórcio troca juros por uma taxa fixa e cada carta contemplada compra um pronto à vista, com desconto',
    leilao: `o desconto de ${p.leilaoDescontoPct}% vira patrimônio já no arremate, mesmo depois de comissão, jurídico, reforma e ${p.leilaoMesesAteAlugar} meses sem aluguel`,
    mix: 'combina o que cada mês permite, esperando o caixa para o leilão quando ele compensa e comprando na planta quando não',
  }
  const folga = melhor.resumo.rendaFinal > 0 ? (melhor.resumo.rendaFinal - segunda.resumo.rendaFinal) / melhor.resumo.rendaFinal : 1
  const empate = folga < 0.03
  const aviso = ordem.some((e) => e.id === 'leilao') ? ' Leilão é a estimativa menos precisa: o risco real (imóvel ocupado, dívida escondida) não entra na conta.' : ''
  const porque = empate
    ? `Empate técnico: ${melhor.nome} ficou na frente por pouco (${BRL.format(melhor.resumo.rendaFinal)} por mês no fim de ${p.years} anos, em reais de hoje, contra ${BRL.format(segunda.resumo.rendaFinal)} de ${segunda.nome}). `
      + `Com a sua margem, as quatro chegam perto uma da outra, então vale escolher pelo risco e pelo trabalho que você aceita, não pelo número.${aviso}`
    : `${melhor.nome} rende mais no fim de ${p.years} anos: ${BRL.format(melhor.resumo.rendaFinal)} por mês em reais de hoje, contra ${BRL.format(segunda.resumo.rendaFinal)} de ${segunda.nome}. `
      + `Isso acontece porque ${motivo[melhor.id]}.${aviso}`
  return { estrategias, recomendada: melhor.id, porque }
}
