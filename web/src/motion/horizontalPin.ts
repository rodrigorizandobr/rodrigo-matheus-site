/** Abaixo disto a rolagem lateral atrapalha mais do que ajuda (dedo rola na vertical). */
export const PIN_MIN_WIDTH = 1024

/** O quanto a trilha precisa deslizar: só o que não cabe na tela. */
export const pinDistance = (trackWidth: number, viewportWidth: number): number =>
  Math.max(0, Math.round(trackWidth - viewportWidth))

/**
 * Prender a seção e rolar para o lado só compensa no desktop, com movimento
 * permitido e com trilha maior que a tela. Em qualquer outro caso a lista vertical
 * é melhor — e continua sendo a mesma marcação, só sem a trilha.
 */
export const shouldPin = ({ width, reduceMotion, distance }: {
  width: number
  reduceMotion: boolean
  distance: number
}): boolean => width >= PIN_MIN_WIDTH && !reduceMotion && distance > 0
