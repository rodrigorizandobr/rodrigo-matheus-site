import { describe, it, expect } from 'vitest'
import { addSection, removeSection, moveSection, setParagraphs, parseTags, weekdayLabels, describeSchedule, nextRunHint, sectionsToText, textToSections } from './editing'
import type { Body } from './types'

const body = (): Body => ({
  title: 'T', excerpt: 'E',
  sections: [
    { heading: 'A', paragraphs: ['a1', 'a2'] },
    { heading: 'B', paragraphs: ['b1'] },
    { heading: 'C', paragraphs: ['c1'] },
  ],
})

describe('edição de seções — sempre imutável', () => {
  it('adicionar não altera o original', () => {
    const antes = body()
    const depois = addSection(antes)
    expect(antes.sections).toHaveLength(3)
    expect(depois.sections).toHaveLength(4)
    expect(depois.sections[3]).toEqual({ heading: '', paragraphs: [''] })
  })

  it('remover tira a seção certa', () => {
    expect(removeSection(body(), 1).sections.map((s) => s.heading)).toEqual(['A', 'C'])
  })

  it('mover para cima e para baixo troca os vizinhos', () => {
    expect(moveSection(body(), 1, -1).sections.map((s) => s.heading)).toEqual(['B', 'A', 'C'])
    expect(moveSection(body(), 1, +1).sections.map((s) => s.heading)).toEqual(['A', 'C', 'B'])
  })

  it('mover além da borda não faz nada em vez de sumir com a seção', () => {
    expect(moveSection(body(), 0, -1).sections.map((s) => s.heading)).toEqual(['A', 'B', 'C'])
    expect(moveSection(body(), 2, +1).sections.map((s) => s.heading)).toEqual(['A', 'B', 'C'])
  })

  it('parágrafos vêm de um textarea: linha em branco separa, espaço sobrando some', () => {
    const b = setParagraphs(body(), 0, '  um  \n\n dois \n\n\n três  ')
    expect(b.sections[0].paragraphs).toEqual(['um', 'dois', 'três'])
  })

  it('textarea vazia deixa a seção sem parágrafo, sem quebrar', () => {
    expect(setParagraphs(body(), 0, '   ').sections[0].paragraphs).toEqual([])
  })
})

describe('tags digitadas', () => {
  it('separa por vírgula, tira espaço e caixa, remove repetida', () => {
    expect(parseTags('IA, ia , Cloud,,arquitetura')).toEqual(['ia', 'cloud', 'arquitetura'])
  })
  it('limita a seis', () => {
    expect(parseTags('a,b,c,d,e,f,g,h')).toHaveLength(6)
  })
})

describe('textos da configuração', () => {
  it('dias da semana em português começando na segunda', () => {
    expect(weekdayLabels()[0]).toBe('seg')
    expect(weekdayLabels()[6]).toBe('dom')
  })

  it('descreve o agendamento em uma frase', () => {
    expect(describeSchedule({ auto_publish: true, delay_days: 2, publish_hour: 8 }))
      .toMatch(/assim que.*gerado/i)
    expect(describeSchedule({ auto_publish: false, delay_days: 0, publish_hour: 8 }))
      .toMatch(/no mesmo dia.*8h/i)
    expect(describeSchedule({ auto_publish: false, delay_days: 1, publish_hour: 19 }))
      .toMatch(/1 dia.*19h/i)
    expect(describeSchedule({ auto_publish: false, delay_days: 3, publish_hour: 8 }))
      .toMatch(/3 dias/i)
  })

  it('explica quando o robô escreve, ou que está desligado', () => {
    expect(nextRunHint({ generate_weekdays: [], generate_hour: 6 })).toMatch(/desligad/i)
    expect(nextRunHint({ generate_weekdays: [0, 3], generate_hour: 6 })).toMatch(/seg.*qui.*6h/i)
  })
})

describe('corpo do post como texto único — um campo só, sem perder estrutura', () => {
  const secoes = [
    { heading: 'Primeira', paragraphs: ['um', 'dois'] },
    { heading: 'Segunda', paragraphs: ['três'] },
  ]

  it('vira texto com ## no título de cada seção', () => {
    expect(sectionsToText(secoes)).toBe('## Primeira\n\num\n\ndois\n\n## Segunda\n\ntrês')
  })

  it('ida e volta não perde nada', () => {
    expect(textToSections(sectionsToText(secoes))).toEqual(secoes)
  })

  it('texto sem nenhum ## vira uma seção sem título', () => {
    expect(textToSections('só um parágrafo\n\ne outro')).toEqual([
      { heading: '', paragraphs: ['só um parágrafo', 'e outro'] },
    ])
  })

  it('parágrafos antes do primeiro ## não são descartados', () => {
    expect(textToSections('abertura\n\n## Título\n\ncorpo')).toEqual([
      { heading: '', paragraphs: ['abertura'] },
      { heading: 'Título', paragraphs: ['corpo'] },
    ])
  })

  it('aceita # e ### também, e tira o espaço sobrando', () => {
    expect(textToSections('#   Um  \n\ntexto\n\n###Dois\n\nmais')).toEqual([
      { heading: 'Um', paragraphs: ['texto'] },
      { heading: 'Dois', paragraphs: ['mais'] },
    ])
  })

  it('seção declarada sem corpo continua existindo — o autor ainda vai escrever', () => {
    expect(textToSections('## Só o título')).toEqual([{ heading: 'Só o título', paragraphs: [] }])
  })

  it('texto vazio devolve lista vazia, não uma seção fantasma', () => {
    expect(textToSections('   \n\n  ')).toEqual([])
  })

  it('quebra de linha simples dentro do parágrafo é preservada como espaço', () => {
    expect(textToSections('uma linha\nsegunda linha')).toEqual([
      { heading: '', paragraphs: ['uma linha segunda linha'] },
    ])
  })
})
