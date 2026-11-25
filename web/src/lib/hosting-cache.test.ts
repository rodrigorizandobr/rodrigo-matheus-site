import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O Firebase Hosting SOBRESCREVE o Cache-Control que o servidor manda com o da regra `**` ("no-cache"). Sem uma regra
 * própria, os valores padrão dos utilitários — lidos por todo visitante, sem login — nunca passam pela borda: toda
 * abertura acorda o Cloud Run, e a primeira espera a partida a frio com o formulário escondido.
 */
type Header = { key: string; value: string }
type Rule = { source: string; headers: Header[] }
const rules: Rule[] = JSON.parse(readFileSync('../firebase.json', 'utf8')).hosting.headers

const cacheDe = (r: Rule) => r.headers.find((h) => h.key === 'Cache-Control')?.value
const indice = (source: string) => rules.findIndex((r) => r.source === source)
const DEFAULTS = '/api/@(planner|pension)/defaults'

describe('borda de 1 minuto para os valores padrão dos utilitários', () => {
  it('existe uma regra própria para os dois endereços', () => {
    const regra = rules.find((r) => r.source === DEFAULTS)
    expect(regra, 'regra dos padrões').toBeDefined()
    expect(cacheDe(regra!)).toMatch(/\bpublic\b/)
    expect(cacheDe(regra!)).toMatch(/s-maxage=60\b/)
  })

  it('o navegador não guarda por conta própria: só a borda, por um minuto', () => {
    expect(cacheDe(rules.find((r) => r.source === DEFAULTS)!)).toMatch(/max-age=0\b/)
  })

  it('vem DEPOIS da regra geral: quando duas regras batem, a última vence', () => {
    expect(indice('**')).toBeGreaterThanOrEqual(0)
    expect(indice(DEFAULTS)).toBeGreaterThan(indice('**'))
  })

  it('nenhum outro endereço da API ganha borda pública: plano pessoal e painel continuam sem cache', () => {
    const publicas = rules.filter((r) => r.source.startsWith('/api') && /\bpublic\b/.test(cacheDe(r) ?? ''))
    expect(publicas.map((r) => r.source)).toEqual([DEFAULTS])
    expect(cacheDe(rules.find((r) => r.source === '**')!)).toMatch(/no-cache/)
  })
})
