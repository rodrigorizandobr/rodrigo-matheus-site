import { SCENES, transitionSrc, videoSrc, linkSrc, type VideoSources } from './scenes'

/**
 * Warm the HTTP cache with the clips the visitor is about to need, in reading order, one file at a
 * time and only after the page is idle. Media elements then play from cache instead of stalling on
 * first use (the cause of the "blurred bust, then a hard cut" the PO saw on a phone).
 *
 * Skipped on Save-Data and on 2G. Order per scene: in-clip (needed first), loop, out-clip.
 */
/**
 * Reading-order list of clip URLs. Scrolling down: the arrival clip of each part (bust → eyes for the
 * first, part → part after) followed by its loop. Then what scrolling up needs (part → part reversed),
 * then the bust exits used by menu jumps.
 */
export function prefetchQueue(mobile: boolean, webm: boolean): string[] {
  const pick = (s: VideoSources) => (webm && s.webm ? s.webm : s.mp4)
  const parts = SCENES.filter((sc) => sc.part !== 'rest' && sc.video !== false)
  const down: string[] = []
  const up: string[] = []
  const exits: string[] = []
  parts.forEach((sc, i) => {
    const prev = i > 0 ? parts[i - 1] : null
    if (sc.transition) down.push(prev ? pick(linkSrc(prev, sc, mobile)) : pick(transitionSrc(sc, 'in', mobile)))
    down.push(pick(videoSrc(sc, mobile)))
    if (prev && sc.transition) up.unshift(pick(linkSrc(sc, prev, mobile)))
    if (sc.transition) exits.push(pick(transitionSrc(sc, 'out', mobile)))
  })
  return [...down, ...up, ...exits]
}

export function prefetchScenes(mobile: boolean, signal?: AbortSignal): void {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  if (nav.connection?.saveData) return
  if (/(^|-)2g$/.test(nav.connection?.effectiveType ?? '')) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const probe = document.createElement('video')
  const webm = probe.canPlayType('video/webm; codecs="vp9"') !== ''
  const queue = prefetchQueue(mobile, webm)

  const run = async () => {
    for (const url of queue) {
      if (signal?.aborted) return
      try {
        const res = await fetch(url, { signal, cache: 'force-cache', priority: 'low' } as RequestInit)
        await res.arrayBuffer() // read to completion so the cache entry is whole
      } catch { /* offline or aborted: the stage still works, just cold */ }
    }
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(() => { void run() }, { timeout: 4000 })
  else setTimeout(() => { void run() }, 1500)
}
