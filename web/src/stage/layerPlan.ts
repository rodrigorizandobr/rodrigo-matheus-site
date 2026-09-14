import type { Phase } from './sceneMachine'

/**
 * Quem aparece, quem toca e quem troca sem transição, em cada fase do palco.
 *
 * INVARIANTE: o que está debaixo do clipe é sempre o DESTINO dele. Como o último frame do clipe é,
 * por construção, o frame 0 do que vem depois (Veo com primeiro+último frame), remover o clipe
 * quando ele acaba é um corte perfeito — invisível. Qualquer fade nessa entrega só ACRESCENTA um
 * cross-dissolve, que é o "efeito de iluminação" que o PO enxergava.
 *
 * Antes do clipe cobrir a tela (`clipStarted` falso, rede fria) vale o contrário: quem aparece é a
 * ORIGEM, para nunca haver corte seco enquanto o clipe ainda não pinta.
 */
export type LayerInput = {
  phase: Phase
  /** este trecho é percorrido por clipe (e não pelo zoom CSS de emergência) */
  useClip: boolean
  /** o clipe já está OPACO na tela (não basta ter começado: durante o fade de entrada ele ainda
   *  deixa ver o que está atrás, e revelar o destino aí faria a cena de chegada piscar antes da viagem) */
  clipCovering: boolean
  /** a viagem começa no close-up de outra parte, não no busto */
  hasFrom: boolean
  /** a cena atual foi alcançada por clipe — decide se a entrega é corte ou fade */
  arrivedByClip: boolean
}

export type LayerPlan = {
  sceneVisible: boolean
  scenePlaying: boolean
  /** troca de opacidade sem transição (corte) */
  sceneInstant: boolean
  fromVisible: boolean
  restPlaying: boolean
}

export function planLayers({ phase, useClip, clipCovering, hasFrom, arrivedByClip }: LayerInput): LayerPlan {
  const covered = useClip && clipCovering
  const base = { sceneVisible: false, scenePlaying: false, sceneInstant: useClip, fromVisible: false, restPlaying: true }

  switch (phase) {
    case 'show':
      // o loop assume: instantâneo se veio de um clipe, suave se veio do zoom CSS
      return { sceneVisible: true, scenePlaying: true, sceneInstant: arrivedByClip, fromVisible: false, restPlaying: false }

    case 'zoomIn':
      if (!useClip) return { ...base, sceneInstant: false } // zoom CSS do busto: a cena só entra no show
      return {
        sceneVisible: covered,          // destino pronto e opaco por baixo do clipe
        scenePlaying: false,            // um vídeo decodificando por vez
        sceneInstant: true,
        fromVisible: hasFrom && !covered,
        restPlaying: !covered && !hasFrom,
      }

    case 'zoomOut':
      if (!useClip) return { ...base, sceneVisible: true, scenePlaying: true, sceneInstant: false }
      return {
        sceneVisible: !covered,         // a parte até o clipe cobrir; depois some (o destino é o busto)
        scenePlaying: !covered,
        sceneInstant: true,
        fromVisible: false,
        restPlaying: covered,
      }

    case 'rest':
    case 'hold':
    default:
      return { ...base, sceneInstant: false }
  }
}
