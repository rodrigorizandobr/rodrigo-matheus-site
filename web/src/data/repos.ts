/** Pure helpers for the ARENA (GitHub repos as loot cards). */
export type Rarity = 'common' | 'rare' | 'legendary'

export type Repo = {
  name: string
  html_url: string
  description: string
  language: string
  topics: string[]
  stargazers_count: number
  forks_count: number
  pushed_at: string
  sparkline: { days: number[]; commits: number } | null
  commits: { sha: string; date: string; message: string }[]
}

export function rarity(stars: number): Rarity {
  if (stars >= 10) return 'legendary'
  if (stars >= 3) return 'rare'
  return 'common'
}

/** GitHub linguist colours for the languages that actually show up; brand cyan otherwise. */
const LANGUAGE_COLORS: Record<string, string> = {
  Python: '#3572A5', TypeScript: '#3178C6', JavaScript: '#F1E05A', HTML: '#E34C26', CSS: '#663399',
  Java: '#B07219', Kotlin: '#A97BFF', Go: '#00ADD8', Rust: '#DEA584', Shell: '#89E051', 'C#': '#178600',
  Swift: '#F05138', Dart: '#00B4AB', PHP: '#4F5D95', Ruby: '#701516', Vue: '#41B883', 'Objective-C': '#438EFF',
  Dockerfile: '#384D54', 'Jupyter Notebook': '#DA5B0B', SCSS: '#C6538C',
}
export const languageColor = (lang: string): string => LANGUAGE_COLORS[lang] ?? '#00f0ff'

const fmt = (n: number) => Number(n.toFixed(2)).toString()

/** 28 daily counts → SVG path in a 100×24 box. Empty input → '' (repo without data). */
export function sparklinePath(days: number[] | undefined, width = 100, height = 24): string {
  if (!days?.length) return ''
  const max = Math.max(...days, 1)
  const step = days.length > 1 ? width / (days.length - 1) : 0
  return days
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${fmt(i * step)},${fmt(height - (v / max) * height)}`)
    .join('')
}

export type TimeAgoDict = { now: string; minutes: string; hours: string; days: string }

/** Same four buckets as v2. `now` injectable for tests. */
export function timeAgo(iso: string, t: TimeAgoDict, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((now - then) / 60_000)
  if (mins < 1) return t.now
  if (mins < 60) return `${mins} ${t.minutes}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ${t.hours}`
  return `${Math.floor(hours / 24)} ${t.days}`
}
