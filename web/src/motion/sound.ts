/**
 * Som de interface, sintetizado na hora — nenhum arquivo.
 *
 * Dois motivos para sintetizar em vez de tocar um mp3: um clique de 20 ms não vale uma
 * requisição nem bytes no bundle, e o Web Audio permite um som curto e discreto, que é o
 * que se pede aqui ("sutil, minimalista"). O timbre acompanha o site: nota curta, sem
 * ataque agressivo, volume baixo.
 *
 * NASCE DESLIGADO e a escolha fica lembrada. Som que toca sem a pessoa pedir é hostil, e
 * navegador nenhum deixa tocar antes do primeiro gesto de qualquer forma.
 */
export const SOUND_KEY = 'sound'

let ctx: AudioContext | null = null

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* aba anônima: vale só para esta sessão */
  }
}

function audio(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
  if (!Ctor) return null
  try {
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Uma nota curta com envelope suave — sem clique seco no começo nem no fim. */
function blip({ freq, duration, peak, type = 'sine' }: {
  freq: number
  duration: number
  peak: number
  type?: OscillatorType
}): void {
  if (!isSoundOn()) return
  const context = audio()
  if (!context) return

  try {
    const osc = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime

    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    osc.connect(gain).connect(context.destination)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  } catch {
    /* contexto fechado ou bloqueado: o site segue sem som */
  }
}

/** Passar o ponteiro por um alvo — quase imperceptível, de propósito. */
export const playTick = () => blip({ freq: 1180, duration: 0.05, peak: 0.018, type: 'triangle' })

/** Confirmar uma ação — um pouco mais presente, ainda discreto. */
export const playConfirm = () => {
  blip({ freq: 660, duration: 0.09, peak: 0.05 })
  setTimeout(() => blip({ freq: 990, duration: 0.12, peak: 0.035 }), 55)
}

/** Escala pentatônica: qualquer sequência de cordas dedilhadas soa bem junta. */
const PLUCK_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]
const PLUCK_LONGEST = 900

/** Trecho curto de fio = corda curta = nota aguda. Acima de 900 px todo trecho soa como o mais grave. */
export function pluckFrequency(lengthPx: number): number {
  const shortness = 1 - Math.min(Math.max(lengthPx, 0), PLUCK_LONGEST) / PLUCK_LONGEST
  return 146.83 * Math.pow(2, PLUCK_SCALE[Math.round(shortness * (PLUCK_SCALE.length - 1))] / 12)
}

/** O ponteiro dedilhou um trecho do fio condutor. `strength` é a velocidade do cruzamento. */
export const playPluck = (lengthPx: number, strength: number) =>
  blip({ freq: pluckFrequency(lengthPx), duration: 0.9, peak: Math.min(0.14, 0.035 + Math.abs(strength) * 0.006), type: 'triangle' })

