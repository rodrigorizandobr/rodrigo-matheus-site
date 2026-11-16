/**
 * Geometria do fio condutor — pura, sem DOM. O fio é uma linha esticada entre pontos (alfinetes):
 * trechos retos, quinas arredondadas, e cada trecho pode ser dedilhado como corda (uma mola por trecho).
 * Quem lê a página e desenha o SVG é `Thread.tsx`; aqui só se faz conta.
 */
export type Pt = { x: number; y: number; pin?: boolean }
export type Seg = { len: number; ux: number; uy: number; /** quanto de fio já passou antes deste trecho */ L0: number }

const CORNER = 13
const SPRING = 0.085
const DAMPING = 0.075
const MAX_BOW = 34
const BOW_FRACTION = 0.16
const REST = 0.05

export function buildSegments(pts: Pt[]): { segs: Seg[]; total: number } {
  const segs: Seg[] = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y
    const len = Math.hypot(dx, dy) || 1e-6
    segs.push({ len, ux: dx / len, uy: dy / len, L0: total })
    total += len
  }
  return { segs, total }
}

const f = (v: number) => v.toFixed(1)

/** Caminho SVG: cada trecho é uma curva que passa pelo meio deslocado (`disp`), e cada quina é arredondada. */
export function pathD(pts: Pt[], segs: Seg[], disp: number[]): string {
  const n = pts.length
  if (n < 2) return ''
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], g = segs[i]
    const rA = i > 0 ? Math.min(CORNER, g.len / 2, segs[i - 1].len / 2) : 0
    const rB = i < n - 2 ? Math.min(CORNER, g.len / 2, segs[i + 1].len / 2) : 0
    const sx = a.x + g.ux * rA, sy = a.y + g.uy * rA
    const ex = b.x - g.ux * rB, ey = b.y - g.uy * rB
    const bow = 2 * (disp[i] ?? 0)
    d += ` Q${f((sx + ex) / 2 - g.uy * bow)} ${f((sy + ey) / 2 + g.ux * bow)} ${f(ex)} ${f(ey)}`
    if (i < n - 2) {
      const h = segs[i + 1]
      d += ` Q${f(b.x)} ${f(b.y)} ${f(b.x + h.ux * rB)} ${f(b.y + h.uy * rB)}`
    }
  }
  return d
}

/**
 * Comprimento de fio que deve estar à mostra quando a "linha de leitura" está na altura `y`.
 * Trecho que desce aparece aos poucos; trecho de lado ou que sobe aparece inteiro quando a leitura
 * alcança o ponto de onde ele parte (a suavização de quem desenha faz ele correr).
 */
export function revealTarget(pts: Pt[], segs: Seg[], y: number): number {
  let L = 0
  for (let i = 0; i < segs.length; i++) {
    const a = pts[i].y, b = pts[i + 1].y
    if (b >= a) {
      if (y >= b) { L += segs[i].len; continue }
      if (y > a) L += (segs[i].len * (y - a)) / (b - a || 1)
      break
    }
    if (y >= a) { L += segs[i].len; continue }
    break
  }
  return L
}

/**
 * O ponteiro foi de `prev` a `cur`: cruzou o trecho que começa em `a`? Devolve a velocidade
 * perpendicular do cruzamento (com sinal), ou 0 se passou ao lado ou fora das pontas.
 */
export function crossing(a: Pt, g: Seg, prev: Pt, cur: Pt): number {
  const c1 = g.ux * (cur.y - a.y) - g.uy * (cur.x - a.x)
  const c0 = g.ux * (prev.y - a.y) - g.uy * (prev.x - a.x)
  if (c1 * c0 >= 0) return 0
  const t = ((cur.x - a.x) * g.ux + (cur.y - a.y) * g.uy) / g.len
  if (t < 0.04 || t > 0.96) return 0
  return (cur.x - prev.x) * -g.uy + (cur.y - prev.y) * g.ux
}

/** Um quadro da mola de cada trecho. Muda `disp` e `vel` no lugar. */
export function step(segs: Seg[], disp: number[], vel: number[]): void {
  for (let i = 0; i < segs.length; i++) {
    vel[i] += -SPRING * disp[i] - DAMPING * vel[i]
    disp[i] += vel[i]
    const lim = Math.min(MAX_BOW, segs[i].len * BOW_FRACTION)
    if (disp[i] > lim) disp[i] = lim
    else if (disp[i] < -lim) disp[i] = -lim
  }
}

export const settled = (disp: number[], vel: number[]): boolean =>
  disp.every((d) => Math.abs(d) < REST) && vel.every((v) => Math.abs(v) < REST)
