import { useEffect, useRef } from 'react'
import { playPluck } from '../motion/sound'
import { buildSegments, crossing, pathD, revealTarget, settled, step, type Pt, type Seg } from './geometry'

const NS = 'http://www.w3.org/2000/svg'
const LAYOUT_EVENT = 'fio:layout'
/** Fração da altura da janela onde fica a "linha de leitura": o fio é desenhado até ali. */
const READING_LINE = 0.74
const EASE = 0.075
const SETTLE_MS = 600

/** Quem move um ponto do fio (filtro de assunto, slider da prévia) avisa; o fio se reacomoda com um tremor. */
export const nudgeThread = () => window.dispatchEvent(new Event(LAYOUT_EVENT))

/**
 * O fio condutor: um SVG por cima do palco (o elemento pai, que precisa ser `position: relative`).
 * `route` lê a página e devolve os pontos por onde o fio passa. O desenho acompanha a rolagem; cada
 * trecho é uma corda que o ponteiro dedilha. O laço de animação DORME quando nada se mexe: um fio
 * parado não pode gastar bateria. Com `prefers-reduced-motion` o fio aparece inteiro e imóvel.
 */
export function Thread({ route }: { route: (stage: HTMLElement) => Pt[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const routeRef = useRef(route)
  routeRef.current = route

  useEffect(() => {
    const svg = svgRef.current
    const stage = svg?.parentElement
    const line = svg?.querySelector<SVGPathElement>('[data-part="line"]')
    const shadow = svg?.querySelector<SVGPathElement>('[data-part="shadow"]')
    const pins = svg?.querySelector<SVGGElement>('[data-part="pins"]')
    if (!svg || !stage || !line || !shadow || !pins) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let pts: Pt[] = [], segs: Seg[] = [], total = 0, drawn = 0
    let disp: number[] = [], vel: number[] = []
    let raf = 0, settleUntil = 0, lastScroll = window.scrollY
    let pointer: Pt | null = null
    const pluckedAt: number[] = []

    const compute = (kick: boolean) => {
      let next: Pt[]
      try {
        next = routeRef.current(stage).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      } catch {
        next = [] // um elemento que sumiu no meio de uma troca de tela não pode derrubar a página
      }
      const built = buildSegments(next)
      if (built.segs.length !== segs.length) { disp = built.segs.map(() => 0); vel = built.segs.map(() => 0) }
      pts = next; segs = built.segs; total = built.total
      if (kick && !reduce) vel = vel.map((v, i) => v + (i % 2 ? 1 : -1) * (2 + Math.random() * 3))
      const want = pts.filter((p) => p.pin).length
      while (pins.childElementCount < want) pins.appendChild(document.createElementNS(NS, 'circle')).setAttribute('r', '4.2')
      while (pins.childElementCount > want) pins.lastElementChild?.remove()
    }

    const draw = () => {
      const d = pathD(pts, segs, disp)
      const dash = `${Math.max(0, drawn).toFixed(1)} ${(total * 2 + 10).toFixed(1)}`
      for (const el of [line, shadow]) {
        el.setAttribute('d', d)
        el.setAttribute('pathLength', Math.max(total, 1).toFixed(1))
        el.setAttribute('stroke-dasharray', dash)
      }
      let k = 0
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i].pin) continue
        const c = pins.children[k++] as SVGCircleElement | undefined
        if (!c) break
        c.setAttribute('cx', pts[i].x.toFixed(1))
        c.setAttribute('cy', pts[i].y.toFixed(1))
        c.style.opacity = (i ? segs[i - 1].L0 + segs[i - 1].len : 0) <= drawn + 3 ? '1' : '0'
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (now < settleUntil) compute(false)
      const top = stage.getBoundingClientRect().top
      if (!reduce) {
        const ds = window.scrollY - lastScroll
        if (ds) {
          const push = Math.max(-1.4, Math.min(1.4, ds * 0.012))
          const from = -top, to = from + window.innerHeight
          for (let i = 0; i < segs.length; i++) {
            if (pts[i].y < to && pts[i + 1].y > from) vel[i] += push * (i % 2 ? 1 : -1) * Math.abs(segs[i].uy)
          }
        }
        step(segs, disp, vel)
      }
      lastScroll = window.scrollY
      const target = reduce ? total : revealTarget(pts, segs, window.innerHeight * READING_LINE - top)
      drawn += (target - drawn) * (reduce ? 1 : EASE)
      if (Math.abs(target - drawn) < 0.4) drawn = target
      draw()
      if (now < settleUntil || drawn !== target || (!reduce && !settled(disp, vel))) raf = requestAnimationFrame(frame)
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(frame) }
    const layout = () => { compute(false); wake() }
    const nudge = () => { compute(true); settleUntil = performance.now() + SETTLE_MS; wake() }

    const onPointer = (e: PointerEvent) => {
      if (reduce) return
      const r = stage.getBoundingClientRect()
      const p = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (pointer) {
        for (let i = 0; i < segs.length; i++) {
          const g = segs[i]
          if (g.L0 > drawn || g.len < 24) continue
          const v = crossing(pts[i], g, pointer, p)
          if (!v) continue
          vel[i] += Math.max(-15, Math.min(15, v * 0.55))
          const now = performance.now()
          if (now - (pluckedAt[i] ?? 0) > 140) { pluckedAt[i] = now; playPluck(g.len, v) }
          wake()
        }
      }
      pointer = p
    }

    window.addEventListener('scroll', wake, { passive: true })
    window.addEventListener('resize', layout)
    window.addEventListener(LAYOUT_EVENT, nudge)
    window.addEventListener('pointermove', onPointer, { passive: true })
    // imagem que termina de carregar empurra tudo para baixo: `load` não borbulha, mas é capturável
    stage.addEventListener('load', layout, true)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout)
    ro?.observe(stage)
    void document.fonts?.ready.then(layout)
    layout()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', wake)
      window.removeEventListener('resize', layout)
      window.removeEventListener(LAYOUT_EVENT, nudge)
      window.removeEventListener('pointermove', onPointer)
      stage.removeEventListener('load', layout, true)
      ro?.disconnect()
    }
  }, [])

  return (
    <svg ref={svgRef} className="fio-thread" aria-hidden="true">
      <path data-part="shadow" />
      <path data-part="line" />
      <g data-part="pins" />
    </svg>
  )
}
