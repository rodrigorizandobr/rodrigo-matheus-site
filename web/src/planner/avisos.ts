import { rotuloMesAno } from './calendario'
import { estresse, spreadAlavancagem } from './indicadores'
import type { MonthRow, PlannerParams } from './types'

export type Aviso = { id: string; nivel: 'atencao' | 'saiba'; texto: string }

const quando = (l: MonthRow) => rotuloMesAno(l.ano, l.mesDoAno)
const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Os avisos da tela, os de atenção primeiro. Cada um traz o mês/ano em que acontece quando há um. */
export function avisos(linhas: MonthRow[], p: PlannerParams): Aviso[] {
  const atencao: Aviso[] = []
  const saiba: Aviso[] = []
  const ultima = linhas.at(-1)

  const negativo = linhas.find((l) => l.saldo < 0)
  if (negativo) {
    atencao.push({
      id: 'saldo-negativo',
      nivel: 'atencao',
      texto: `A partir de ${quando(negativo)} o caixa fica negativo: as contas obrigatórias (parcelas, apê, custos fixos, consórcio) passam do que entra. O plano não fecha como está.`,
    })
  }

  if (p.aposTransicao === 'vive_da_renda' && p.metaRendaHoje > 0) {
    const t = linhas.find((l) => l.mes > p.anoTransicao * 12)
    if (t && t.metaDoMes > 0 && t.rendaDisponivel < t.metaDoMes) {
      const pct = Math.max(0, Math.round((t.rendaDisponivel / t.metaDoMes) * 100))
      atencao.push({
        id: 'transicao-nao-cobre',
        nivel: 'atencao',
        texto: `Na transição (${quando(t)}) a renda disponível cobre ${pct}% da sua meta. Você retira só o que a renda permite — adie a transição ou reduza a meta para fechar a conta.`,
      })
    }
  }

  if (p.cronograma === 'contrato') {
    const e = estresse(linhas)
    const limite = Math.min(3, p.reservaMeses > 0 ? p.reservaMeses : 3)
    const casa = linhas.find((l) => l.mes === e.piorFolego?.mes)
    if (e.piorFolego && casa && e.piorFolego.meses < limite) {
      atencao.push({
        id: 'folego-curto',
        nivel: 'atencao',
        texto: `Em ${quando(casa)} o caixa paga só ${n1.format(e.piorFolego.meses)} meses de obrigações se nenhum studio render. Aumente a reserva mínima, reduza a parte financiada ou espaçe as compras.`,
      })
    }
  }

  if (p.cronograma === 'contrato' && ultima) {
    const s = spreadAlavancagem(p, ultima.ano)
    if (s.spread < 0 && 100 - (p.entradaPct + p.mensaisPct + p.reforcoPct + p.chavesPct) > 0) {
      atencao.push({
        id: 'spread-negativo',
        nivel: 'atencao',
        texto: `Parcelar com a construtora custa mais do que o studio rende (${n1.format(s.custoCredito)}% contra ${n1.format(s.retornoImovel)}% a.a.). A alavancagem aumenta o número de studios, mas reduz o patrimônio.`,
      })
    }
  }

  if (p.pctTemporada > 0) {
    atencao.push({
      id: 'temporada-regras',
      nivel: 'atencao',
      texto: 'Temporada depende do condomínio e da cidade. Em maio de 2026 o STJ decidiu que, em condomínio residencial, a locação por temporada via aplicativo só vale com autorização expressa na convenção (REsp 2.121.055/MG; a tese geral ainda será fixada no Tema 1.443). Em São Paulo, unidades HIS e HMP não podem ser anunciadas para temporada.',
    })
  }

  if (p.consorcioCotas > 0) {
    const atrasadas = linhas.reduce((m, l) => Math.max(m, l.contemplacoesAtrasadas), 0)
    if (atrasadas > 0) {
      atencao.push({
        id: 'consorcio-atrasado',
        nivel: 'atencao',
        texto: `Faltou caixa para o lance no mês previsto: ${atrasadas} carta(s) saíram depois do planejado ou não saíram no horizonte.`,
      })
    }
  }

  if (p.cronograma === 'contrato') {
    const e = estresse(linhas)
    const casa = linhas.find((l) => l.mes === e.piorCobertura?.mes)
    if (e.piorCobertura && casa && e.piorCobertura.razao < 1) {
      saiba.push({
        id: 'cobertura-baixa',
        nivel: 'saiba',
        texto: `Em ${quando(casa)} aluguéis e aporte cobrem ${n1.format(e.piorCobertura.razao)}× das parcelas: o resto sai do caixa. Funciona enquanto o caixa aguenta.`,
      })
    }
  }

  if (p.custoStudio <= 537_673) {
    saiba.push({
      id: 'his-hmp',
      nivel: 'saiba',
      texto: 'No centro de São Paulo, studios vendidos como habitação popular (HIS e HMP — tetos de R$ 276 mil, R$ 384 mil e R$ 538 mil em 2026) têm limite de renda para o comprador, aluguel limitado e não podem ir para temporada. Confira no memorial se a sua unidade é R2v ou NR.',
    })
  }

  const adicional = linhas.find((l) => l.aluguelRecebido > 62_500)
  if (adicional) {
    saiba.push({
      id: 'adicional-irpj',
      nivel: 'saiba',
      texto: `A partir de ${quando(adicional)} a receita de aluguel passa de R$ 62,5 mil por mês: sobre o excedente há adicional de IRPJ de 3,2%, que o simulador não desconta.`,
    })
  }

  const dividendos = linhas.find((l) => l.rendaDisponivel > 100_000)
  if (dividendos) {
    saiba.push({
      id: 'dividendos',
      nivel: 'saiba',
      texto: `A partir de ${quando(dividendos)} a distribuição passa de R$ 50 mil por mês por sócio (considerando 2 sócios): há imposto de 10% retido sobre o total distribuído (Lei 15.270/2025), que o simulador não desconta.`,
    })
  }

  if (p.consorcioCotas > 0) {
    saiba.push({
      id: 'consorcio-hipotese',
      nivel: 'saiba',
      texto: `A data de contemplação do consórcio é uma hipótese sua (lance de ${n1.format(p.consorcioLancePct)}%, uma carta a cada ${p.consorcioIntervaloMeses} meses). Por sorteio ela pode sair no último mês do grupo; teste o plano com um intervalo maior.`,
    })
  }

  if (p.agioProntoPct > 0) {
    saiba.push({
      id: 'agio-hipotese',
      nivel: 'saiba',
      texto: `O ágio de ${n1.format(p.agioProntoPct)}% do pronto sobre a planta é uma hipótese sua, sem índice oficial. Teste o plano também com zero.`,
    })
  }

  return [...atencao, ...saiba]
}
