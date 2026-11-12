import { useMemo, useState } from 'react'
import { emReaisDeHoje } from '../../planner/inflacao'
import type { EstrategiaRodada, Evento, IdEstrategia, TipoEvento } from '../../planner/caminhos'
import { rotuloMesAno } from '../../planner/calendario'
import { formatBRL, formatBRLCompact } from '../../planner/format'

const W = 680
const H = 300
const PAD = { top: 18, right: 16, bottom: 30, left: 78 }

export type Metrica = 'renda' | 'patrimonio'

/** Uma cor e um traço por estratégia: a identidade nunca depende só da cor. */
export const ESTILO: Record<IdEstrategia, { cor: string; dash?: string; largura: number }> = {
  construtora: { cor: 'var(--red)', largura: 2 },
  consorcio: { cor: '#2563eb', dash: '7 4', largura: 2 },
  leilao: { cor: '#047857', dash: '2 4', largura: 2.4 },
  mix: { cor: 'var(--heading)', largura: 3 },
}

const ROTULO_EVENTO: Record<TipoEvento, string> = {
  compra: 'Compra na planta', leilao: 'Leilão', contemplacao: 'Consórcio contemplado', venda: 'Venda',
  chaves: 'Chaves', fgts: 'Compra com FGTS', transicao: 'Transição', meta: 'Meta atingida',
}

/** Forma do marcador por tipo de acontecimento (a cor é a da estratégia). */
function Marcador({ x, y, tipo, cor, titulo }: { x: number; y: number; tipo: TipoEvento; cor: string; titulo: string }) {
  const comum = { stroke: 'var(--surface)', strokeWidth: 1.5 }
  if (tipo === 'chaves') {
    return <polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} fill={cor} {...comum}><title>{titulo}</title></polygon>
  }
  if (tipo === 'venda') {
    return <rect x={x - 4} y={y - 4} width="8" height="8" fill={cor} {...comum}><title>{titulo}</title></rect>
  }
  if (tipo === 'transicao' || tipo === 'meta') {
    return <circle cx={x} cy={y} r="6" fill="var(--surface)" stroke={cor} strokeWidth="2.5"><title>{titulo}</title></circle>
  }
  return <circle cx={x} cy={y} r="4" fill={cor} {...comum}><title>{titulo}</title></circle>
}

/**
 * As quatro estratégias no mesmo gráfico (um eixo só, em reais de hoje): renda por mês ou patrimônio ao longo dos
 * meses, com os acontecimentos da estratégia escolhida marcados sobre a linha dela. Legenda sempre visível e cristal
 * de foco ao passar o mouse. Um gráfico por métrica — sem botão para alternar.
 */
export function PlannerChartEstrategias({ estrategias, selecionada, onSelecionar, metrica, ipca }: {
  estrategias: EstrategiaRodada[]
  selecionada: IdEstrategia
  onSelecionar: (id: IdEstrategia) => void
  metrica: Metrica
  ipca: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const meses = estrategias[0].linhas.length
  const series = useMemo(() => estrategias.map((e) => ({
    e,
    valores: e.linhas.map((l) => emReaisDeHoje(metrica === 'renda' ? l.rendaDisponivel : l.patrimonioLiquido, l.mes, ipca)),
  })), [estrategias, metrica, ipca])

  const { minY, maxY } = useMemo(() => {
    const todos = series.flatMap((s) => s.valores)
    return { minY: Math.min(0, ...todos), maxY: Math.max(1, ...todos) }
  }, [series])

  const xOf = (mes: number) => PAD.left + (mes / meses) * (W - PAD.left - PAD.right)
  const yOf = (v: number) => H - PAD.bottom - ((v - minY) / (maxY - minY)) * (H - PAD.top - PAD.bottom)
  const linha = (valores: number[]) => valores.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i + 1).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY))
  const anos = Math.floor(meses / 12)
  const passo = anos > 14 ? 5 : anos > 8 ? 2 : 1
  const ativo = hover ?? meses - 1
  const sel = series.find((s) => s.e.id === selecionada)!
  const eventosSel: Evento[] = sel.e.eventos
  const eventosNoMes = eventosSel.filter((ev) => ev.mes === ativo + 1)
  const rotuloMetrica = metrica === 'renda' ? 'Renda disponível por mês' : 'Patrimônio líquido'
  const moedaTxt = 'em reais de hoje'
  const l0 = estrategias[0].linhas[ativo]

  return (
    <div className="panel hud-frame p-4 md:p-6 min-w-0">
      <div className="hud-label mb-2">{metrica === 'renda' ? 'Renda por mês' : 'Patrimônio'} <span className="normal-case tracking-normal text-muted">· R$ de hoje</span></div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] mb-2">
        {estrategias.map((e) => {
          const s = ESTILO[e.id]
          const ligada = e.id === selecionada
          return (
            <button key={e.id} type="button" aria-pressed={ligada} onClick={() => onSelecionar(e.id)}
                    className={`inline-flex items-center gap-2 ${ligada ? 'text-heading font-semibold' : 'text-muted'} hover:text-heading`}>
              <svg width="26" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="26" y2="4" stroke={s.cor} strokeWidth={s.largura} strokeDasharray={s.dash} />
              </svg>
              {e.nome}
            </button>
          )
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full h-auto select-none"
           aria-label={`${rotuloMetrica} das quatro estratégias (construtora, consórcio, leilão e mix) ao longo de ${anos} anos, ${moedaTxt}`}
           onMouseLeave={() => setHover(null)}
           onMouseMove={(e) => {
             const rect = e.currentTarget.getBoundingClientRect()
             const x = ((e.clientX - rect.left) / rect.width) * W
             const mes = Math.round(((x - PAD.left) / (W - PAD.left - PAD.right)) * meses)
             setHover(Math.min(meses - 1, Math.max(0, mes - 1)))
           }}>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={yOf(v)} dy="0.32em" textAnchor="end" className="fill-muted" fontSize="10">{formatBRLCompact(v)}</text>
          </g>
        ))}
        {Array.from({ length: anos + 1 }, (_, a) => a).filter((a) => a % passo === 0 || a === anos).map((a) => (
          <text key={a} x={xOf(a * 12)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-muted" fontSize="10">{a}</text>
        ))}
        <text x={W - PAD.right} y={H - 2} textAnchor="end" className="fill-muted" fontSize="9">anos</text>

        {series.filter((s) => s.e.id !== selecionada).map(({ e, valores }) => (
          <path key={e.id} d={linha(valores)} fill="none" stroke={ESTILO[e.id].cor} strokeWidth={ESTILO[e.id].largura} strokeDasharray={ESTILO[e.id].dash}
                strokeLinejoin="round" opacity="0.55" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={linha(sel.valores)} fill="none" stroke={ESTILO[selecionada].cor} strokeWidth={ESTILO[selecionada].largura + 0.6} strokeDasharray={ESTILO[selecionada].dash}
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {eventosSel.map((ev, i) => (
          <Marcador key={`${ev.mes}-${ev.tipo}-${i}`} x={xOf(ev.mes)} y={yOf(sel.valores[ev.mes - 1])} tipo={ev.tipo}
                    cor={ESTILO[selecionada].cor} titulo={`${rotuloMesAno(ev.ano, ev.mesDoAno)}: ${ev.texto}`} />
        ))}

        {hover !== null && <line x1={xOf(ativo + 1)} x2={xOf(ativo + 1)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--heading)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />}
        {series.map(({ e, valores }) => (
          <circle key={e.id} cx={xOf(ativo + 1)} cy={yOf(valores[ativo])} r="3.5" fill={ESTILO[e.id].cor} stroke="var(--surface)" strokeWidth="1.5" />
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted mt-1">
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="currentColor" /></svg>compra, leilão, consórcio</span>
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><polygon points="6,1 11,6 6,11 1,6" fill="currentColor" /></svg>chaves</span>
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" fill="currentColor" /></svg>venda</span>
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>fim do prazo</span>
      </div>

      <div className="mt-3 grid gap-1 text-[12px]" aria-live="polite">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">{rotuloMesAno(l0.ano, l0.mesDoAno)} · ano {l0.anoDoPlano}</span>
          <span className="text-muted">{rotuloMetrica}, {moedaTxt}</span>
        </div>
        {series.map(({ e, valores }) => (
          <div key={e.id} className="flex items-baseline justify-between">
            <span className="inline-flex items-center gap-2 text-muted">
              <svg width="14" height="6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke={ESTILO[e.id].cor} strokeWidth="3" /></svg>{e.nome}
            </span>
            <span className="font-display font-semibold text-heading tabular-nums">{formatBRL(valores[ativo])}</span>
          </div>
        ))}
        {eventosNoMes.map((ev, i) => (
          <p key={i} className="text-heading mt-1"><strong>{ROTULO_EVENTO[ev.tipo]}:</strong> {ev.texto}</p>
        ))}
      </div>
    </div>
  )
}
