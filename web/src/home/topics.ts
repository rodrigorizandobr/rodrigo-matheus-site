/**
 * Assuntos do "puxe um fio": saem das tags dos posts, sem cadastro. A mesma tag chega escrita de
 * vários jeitos ("inteligência artificial", "inteligencia-artificial"), então tudo é comparado por
 * uma chave sem acento, sem hífen e em minúsculas.
 */
export type Topic = { key: string; label: string; count: number }
type Tagged = { tags?: string[] | null }

export const tagKey = (tag: string): string =>
  tag.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

const accented = (s: string) => /[^\x00-\x7f]/.test(s)

/** As tags que aparecem em pelo menos dois posts, da mais usada para a menos. */
export function topics(posts: Tagged[], max = 5): Topic[] {
  const seen = new Map<string, { count: number; spellings: Map<string, number> }>()
  for (const post of posts) {
    const keys = new Set<string>()
    for (const raw of post.tags ?? []) {
      const key = tagKey(raw)
      if (!key) continue
      const entry = seen.get(key) ?? { count: 0, spellings: new Map<string, number>() }
      if (!keys.has(key)) { entry.count++; keys.add(key) }
      entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + 1)
      seen.set(key, entry)
    }
  }
  return [...seen.entries()]
    .filter(([, e]) => e.count >= 2)
    .map(([key, e]) => {
      // a grafia mais usada; no empate, a acentuada (Map preserva a ordem de chegada para o resto)
      const label = [...e.spellings.entries()].sort((a, b) => b[1] - a[1] || Number(accented(b[0])) - Number(accented(a[0])))[0][0]
      return { key, label, count: e.count }
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, max)
}

export const hasTopic = (post: Tagged, key: string): boolean => (post.tags ?? []).some((t) => tagKey(t) === key)
