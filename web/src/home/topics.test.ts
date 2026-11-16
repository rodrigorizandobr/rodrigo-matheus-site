import { describe, expect, it } from 'vitest'
import { hasTopic, tagKey, topics } from './topics'

const posts = [
  { tags: ['inteligência artificial', 'Segurança', 'openai'] },
  { tags: ['inteligencia-artificial', 'seguranca', 'nvidia'] },
  { tags: ['Inteligência Artificial', 'robótica'] },
  { tags: ['robótica', 'tesla'] },
  { tags: [] },
  {},
]

describe('assuntos do "puxe um fio"', () => {
  it('a mesma tag com acento, hífen ou caixa diferente é um assunto só', () => {
    expect(tagKey('Inteligência Artificial')).toBe(tagKey('inteligencia-artificial'))
  })

  it('saem das tags mais frequentes, da mais usada para a menos', () => {
    const t = topics(posts)
    expect(t.map((x) => x.key)).toEqual(['inteligencia artificial', 'robotica', 'seguranca'])
    expect(t[0].count).toBe(3)
  })

  it('o rótulo é a grafia mais usada, de preferência a acentuada', () => {
    expect(topics(posts)[0].label).toBe('inteligência artificial')
    expect(topics(posts)[2].label).toBe('Segurança')
  })

  it('tag que aparece num post só não vira assunto', () => {
    expect(topics(posts).some((x) => x.key === 'tesla')).toBe(false)
  })

  it('respeita o limite pedido', () => {
    expect(topics(posts, 2)).toHaveLength(2)
  })

  it('sabe dizer se um post é do assunto', () => {
    expect(hasTopic(posts[1], 'seguranca')).toBe(true)
    expect(hasTopic(posts[3], 'seguranca')).toBe(false)
    expect(hasTopic(posts[5], 'seguranca')).toBe(false)
  })
})
