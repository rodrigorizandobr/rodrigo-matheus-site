/**
 * Duração do esmaecer do clipe de transição, nas DUAS pontas (loop → clipe e clipe → loop).
 * Mantida em sincronia com `.stage-trans` em src/styles/tokens.css por src/stage/timing.test.ts.
 *
 * Só o clipe varia de opacidade: o que está embaixo dele já está opaco (src/stage/layerPlan.ts),
 * então a passagem é uma rampa única — e não duas sobrepostas, que é o que produz fantasma.
 */
export const CLIP_FADE_MS = 400
