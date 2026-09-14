import { describe, it, expect } from 'vitest'
import { planLayers } from './layerPlan'

/**
 * A invariante do palco: o que está DEBAIXO do clipe precisa ser o DESTINO dele. Assim, quando o
 * clipe acaba e é removido, a troca é um corte perfeito (o último frame do clipe é o frame 0 do
 * loop) — sem cross-dissolve. Foi o cross-dissolve que o PO viu como "efeito de iluminação/fade".
 */
const plan = (o: Partial<Parameters<typeof planLayers>[0]> = {}) =>
  planLayers({ phase: 'show', useClip: true, clipCovering: true, hasFrom: false, arrivedByClip: true, ...o })

describe('planLayers — quem aparece em cada fase', () => {
  it('repouso: só o busto, tocando', () => {
    const p = plan({ phase: 'rest', useClip: false, clipCovering: false, arrivedByClip: false })
    expect(p).toMatchObject({ sceneVisible: false, restPlaying: true })
  })

  describe('chegando numa parte (zoomIn com clipe)', () => {
    it('antes do clipe cobrir: quem aparece é a ORIGEM (busto), a cena fica escondida', () => {
      const p = plan({ phase: 'zoomIn', clipCovering: false })
      expect(p.sceneVisible).toBe(false)
      expect(p.restPlaying).toBe(true)
    })
    it('enquanto o clipe ainda ESTÁ SURGINDO (fade de entrada) o destino segue escondido — senão pisca antes da viagem', () => {
      // clipCovering só vira true quando o clipe já está opaco, não no primeiro frame decodificado
      expect(plan({ phase: 'zoomIn', clipCovering: false, hasFrom: true }).sceneVisible).toBe(false)
      expect(plan({ phase: 'zoomIn', clipCovering: false, hasFrom: true }).fromVisible).toBe(true)
    })
    it('com o clipe cobrindo: a cena (destino) já fica opaca POR BAIXO, parada no frame 0', () => {
      const p = plan({ phase: 'zoomIn', clipCovering: true })
      expect(p.sceneVisible).toBe(true)
      expect(p.scenePlaying).toBe(false) // um vídeo decodificando por vez
      expect(p.restPlaying).toBe(false)
    })
    it('vindo de outra parte: a origem fica visível até o clipe cobrir', () => {
      expect(plan({ phase: 'zoomIn', clipCovering: false, hasFrom: true }).fromVisible).toBe(true)
      expect(plan({ phase: 'zoomIn', clipCovering: true, hasFrom: true }).fromVisible).toBe(false)
    })
  })

  describe('voltando ao busto (zoomOut com clipe)', () => {
    it('antes de cobrir mostra a parte; depois de cobrir ESCONDE (o destino é o busto)', () => {
      expect(plan({ phase: 'zoomOut', clipCovering: false }).sceneVisible).toBe(true)
      expect(plan({ phase: 'zoomOut', clipCovering: true }).sceneVisible).toBe(false)
    })
    it('o busto volta a tocar assim que o clipe o cobre', () => {
      expect(plan({ phase: 'zoomOut', clipCovering: true }).restPlaying).toBe(true)
    })
  })

  describe('entrega para o loop (show)', () => {
    it('chegou por clipe: a cena troca SEM transição — nada de cross-dissolve', () => {
      const p = plan({ phase: 'show', arrivedByClip: true })
      expect(p).toMatchObject({ sceneVisible: true, scenePlaying: true, sceneInstant: true })
    })
    it('chegou pelo zoom CSS (clipe faltou): aí sim o fade suave é o certo', () => {
      const p = plan({ phase: 'show', useClip: false, arrivedByClip: false })
      expect(p).toMatchObject({ sceneVisible: true, sceneInstant: false })
    })
  })

  it('hold: busto tocando, nenhuma cena', () => {
    const p = plan({ phase: 'hold', useClip: false, clipCovering: false, arrivedByClip: false })
    expect(p).toMatchObject({ sceneVisible: false, restPlaying: true })
  })
})
