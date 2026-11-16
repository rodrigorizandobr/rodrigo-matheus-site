/**
 * Por onde o fio passa na home. A página marca os elementos com `data-fio="…"`; aqui eles viram
 * pontos, em ordem, em coordenadas do palco. Cada parada é opcional: enquanto os posts carregam, ou
 * se o post mais recente não tiver capa, o fio simplesmente pula o que não existe.
 */
import type { Pt } from './geometry'

const WIDE = '(min-width: 860px)'
/** Distância entre a borda do texto e o fio (meio da marca `//` do cabeçalho, que tem 18 px). */
const LANE = 9
const FRAME = 9

export type Box = { l: number; t: number; w: number; h: number }
type Pinch = { x: number; y: number }

/** Quanto o fio avança para dentro da mão depois da pinça: a ponta some atrás dos dedos (a imagem fica POR CIMA do fio). */
const PINCH_INSET = 16

/** `data-pinch="x,y"`: em que fração da imagem (não espelhada) fica a fenda entre o indicador e o polegar. */
export function parsePinch(attr: string | null): Pinch {
  const [x, y] = (attr ?? '').split(',').map(Number)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0.5, y: 0.5 }
}

/** Onde o fio termina. Sem espelho a mão entra pela direita e o fio chega pela esquerda; espelhada, o contrário. */
export function pinchEnd(box: Box, pinch: Pinch, mirrored: boolean): Pt {
  const y = box.t + box.h * pinch.y
  return mirrored
    ? { x: box.l + box.w * (1 - pinch.x) - PINCH_INSET, y }
    : { x: box.l + box.w * pinch.x + PINCH_INSET, y }
}

export function homeRoute(stage: HTMLElement): Pt[] {
  const origin = stage.getBoundingClientRect()
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect()
    return { l: r.left - origin.left, t: r.top - origin.top, w: r.width, h: r.height }
  }
  const one = (name: string) => stage.querySelector(`[data-fio="${name}"]`)
  const all = (name: string) => [...stage.querySelectorAll(`[data-fio="${name}"]`)]
  const wide = window.matchMedia(WIDE).matches

  const wrap = stage.querySelector('.fio-wrap')
  if (!wrap) return []
  const wb = box(wrap), cs = getComputedStyle(wrap)
  const left = wb.l + (parseFloat(cs.paddingLeft) || 0) + LANE
  const right = wb.l + wb.w - (parseFloat(cs.paddingRight) || 0) - LANE

  const mark = document.querySelector('[data-fio="mark"]')
  const mb = mark ? box(mark) : null
  const x0 = mb ? mb.l + mb.w / 2 : left
  const out: Pt[] = [{ x: x0, y: 0 }]
  const last = () => out[out.length - 1]

  const blog = one('blog')
  const blogTop = blog ? box(blog).t : null

  const tail = one('u')
  if (tail) {
    const b = box(tail)
    const y = b.t + b.h + 13
    out.push({ x: x0, y }, { x: b.l + b.w + 3, y })
    const cover = one('cover')
    if (cover) {
      const c = box(cover)
      if (wide) out.push({ x: c.l - FRAME, y: c.t - FRAME, pin: true })
      out.push({ x: c.l + c.w + FRAME, y: c.t - FRAME, pin: true }, { x: c.l + c.w + FRAME, y: c.t + c.h + FRAME, pin: true })
      out.push({ x: c.l - FRAME, y: c.t + c.h + FRAME, pin: true })
      if (blogTop !== null) out.push({ x: c.l - FRAME, y: blogTop })
    } else if (blogTop !== null) {
      // sem capa: o fio segue até a margem direita e desce por ela, para não cortar o resumo
      out.push({ x: right, y }, { x: right, y: blogTop })
    }
  }
  if (blogTop !== null) out.push({ x: left, y: blogTop })

  for (const row of all('row')) {
    if (row.getAttribute('data-on') === 'false') continue
    out.push({ x: left, y: box(row).t + 32, pin: true })
  }

  const chart = all('cp')
  for (const el of chart) {
    const b = box(el)
    out.push({ x: b.l + b.w / 2, y: b.t + b.h / 2, pin: true })
  }

  const career = one('career')
  if (career) {
    const top = box(career).t
    if (chart.length) out.push({ x: right, y: last().y }, { x: right, y: top })
    out.push({ x: left, y: top })
    const pins = all('kp').map((el) => { const b = box(el); return { x: b.l + b.w / 2, y: b.t + b.h / 2, pin: true } })
    if (pins.length && wide) out.push({ x: left, y: pins[0].y })
    out.push(...pins)
  }

  // A mão é espelhada no desktop (fio.css, ≥ 860 px): `wide` aqui e o `scaleX(-1)` lá andam juntos.
  const hand = one('hand')
  if (hand) {
    const end = pinchEnd(box(hand), parsePinch(hand.getAttribute('data-pinch')), wide)
    out.push({ x: wide ? right : left, y: end.y }, end)
  }
  return out
}
