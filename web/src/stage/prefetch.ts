import { SCENES, transitionSrc, videoSrc, type VideoSources } from './scenes'

/**
 * Warm the HTTP cache with the clips the visitor is about to need, in reading order, one file at a
 * time and only after the page is idle. Media elements then play from cache instead of stalling on
 * first use (the cause of the "blurred bust, then a hard cut" the PO saw on a phone).
 *
 * Skipped on Save-Data and on 2G. Order per scene: in-clip (needed first), loop, out-clip.
 */
/** Reading-order list of clip URLs: per scene, in-clip first (needed first), then loop, then out-clip. */
export function prefetchQueue(mobile: boolean, webm: boolean): string[] {
  const pick = (s: VideoSources) => (webm && s.webm ? s.webm : s.mp4)
  const queue: string[] = []
  for (const sc of SCENES) {
    if (sc.part === 'rest' || sc.video === false) continue
    if (sc.transition) queue.push(pick(transitionSrc(sc, 'in', mobile)))
    queue.push(pick(videoSrc(sc, mobile)))
    if (sc.transition) queue.push(pick(transitionSrc(sc, 'out', mobile)))
  }
  return queue
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
