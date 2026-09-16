/**
 * Character sheet — pure derivation from the i18n dictionary.
 * No numbers live here: LEVEL, stats and classes all come from the copy the
 * site already ships, so the HUD can never drift from the CV.
 */
import type { Dictionary } from '../i18n/types'

export type StatKey = 'years' | 'people' | 'leading' | 'ai'
export type Stat = { key: StatKey; label: string; value: string; pct: number }
export type CharacterClass = { id: string; label: string; blurb: string; gesture: string; unit?: string }
export type Character = {
  name: string
  title: string
  level: number
  stats: Stat[]
  classes: CharacterClass[]
  skills: string[]
}

/** Ceilings that turn a raw career number into a 0–100 bar. */
const CEILING: Record<Exclude<StatKey, 'ai'>, number> = { years: 30, people: 50, leading: 20 }
const STAT_KEYS: Exclude<StatKey, 'ai'>[] = ['years', 'people', 'leading']
const FALLBACK_GESTURES = ['Wave', 'ThumbsUp', 'Yes', 'Punch']

const num = (s: string | undefined) => Number.parseInt((s ?? '').replace(/\D/g, ''), 10) || 0
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function buildCharacter(t: Dictionary | undefined): Character {
  if (!t?.hero) return { name: '', title: '', level: 0, stats: [], classes: [], skills: [] }

  const hero = t.hero
  const rawStats = hero.stats ?? []
  const labels = t.hud?.stat_labels

  const stats: Stat[] = STAT_KEYS.map((key, i) => {
    const value = rawStats[i]?.value ?? '0'
    return {
      key,
      label: labels?.[key] ?? rawStats[i]?.label ?? key,
      value,
      pct: clampPct((num(value) / CEILING[key]) * 100),
    }
  })

  const hasAI = (t.education?.items ?? []).some((e) => /intellig|intelig/i.test(e.degree))
  stats.push({ key: 'ai', label: labels?.ai ?? 'AI / ML', value: hasAI ? 'FIAP ’25' : '—', pct: hasAI ? 85 : 0 })

  const classes: CharacterClass[] = hero.classes?.length
    ? hero.classes
    : (hero.tag ?? '')
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label, i) => ({ id: slug(label), label, blurb: hero.subtitle ?? '', gesture: FALLBACK_GESTURES[i % FALLBACK_GESTURES.length] }))

  const level = num(rawStats[0]?.value)
  return {
    name: hero.name ?? '',
    title: hero.tag ?? '',
    level,
    stats,
    classes,
    skills: t.about?.pills ?? [],
  }
}
