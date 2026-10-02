import { describe, it, expect } from 'vitest'
import { addSection, removeSection, moveSection, setParagraphs, parseTags, weekdayLabels, describeSchedule, nextRunHint, sectionsToText, textToSections, toggleHeading, insertSection, countWords, linkedinShareQuestion, deleteQuestion, statusLabel, hasUnsavedChanges, formatDay } from './editing'
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


describe('barra de formatação — funções puras sobre texto + seleção', () => {
  it('transforma a linha do cursor em título de seção', () => {
    const r = toggleHeading('um parágrafo\n\noutro', 3, 3)
    expect(r.text).toBe('## um parágrafo\n\noutro')
    expect(r.start).toBe(6)
  })

  it('numa linha que já é título, tira o ## (alternar)', () => {
    const r = toggleHeading('## Título\n\ntexto', 4, 4)
    expect(r.text).toBe('Título\n\ntexto')
    expect(r.start).toBe(1)
  })

  it('só mexe na linha onde está o cursor, não no parágrafo vizinho', () => {
    const r = toggleHeading('primeiro\n\nsegundo', 12, 12)
    expect(r.text).toBe('primeiro\n\n## segundo')
  })

  it('seleção cobrindo várias linhas vira título em todas', () => {
    const r = toggleHeading('a\nb', 0, 3)
    expect(r.text).toBe('## a\n## b')
  })

  it('o que a barra produz volta como seção pelo textToSections (ida-e-volta)', () => {
    const r = toggleHeading('Fatos\n\nO texto da seção.', 0, 0)
    expect(textToSections(r.text)).toEqual([{ heading: 'Fatos', paragraphs: ['O texto da seção.'] }])
  })

  it('nova seção entra no cursor, separada por linha em branco, com o cursor depois do ##', () => {
    const r = insertSection('antes\n\ndepois', 5)
    expect(r.text).toBe('antes\n\n## \n\ndepois')
    expect(r.start).toBe(r.text.indexOf('## ') + 3)
  })

  it('nova seção em texto vazio não deixa linhas em branco sobrando', () => {
    const r = insertSection('', 0)
    expect(r.text).toBe('## ')
    expect(r.start).toBe(3)
  })

  it('conta palavras ignorando os ##', () => {
    expect(countWords('## Título aqui\n\ndois três')).toBe(4)
    expect(countWords('')).toBe(0)
  })
})

describe('linkedinShareQuestion — o que o autor lê antes de confirmar', () => {
  const base = { status: 'published', linkedinPostedAt: null } as const

  it('post no ar e inédito: só a pergunta', () => {
    const q = linkedinShareQuestion(base)
    expect(q).toMatch(/publicar este post no linkedin/i)
    expect(q).not.toMatch(/ainda não está no ar|já foi/i)
  })

  it.each(['draft', 'scheduled'] as const)('post %s avisa que o link vai levar a uma página que não existe', (status) => {
    expect(linkedinShareQuestion({ ...base, status })).toMatch(/ainda não está no ar/i)
  })

  it('post já compartilhado avisa a data e que vai duplicar', () => {
    const q = linkedinShareQuestion({ ...base, linkedinPostedAt: '2026-09-15T12:00:00Z' })
    expect(q).toMatch(/2026-09-15/)
    expect(q).toMatch(/repetid|duplic/i)
  })

  it('rascunho já compartilhado junta os dois avisos', () => {
    const q = linkedinShareQuestion({ status: 'draft', linkedinPostedAt: '2026-09-15T12:00:00Z' })
    expect(q).toMatch(/ainda não está no ar/i)
    expect(q).toMatch(/2026-09-15/)
  })
})

describe('deleteQuestion — o que o autor lê antes de apagar para sempre', () => {
  const base = {
    status: 'draft', linkedinPostedAt: null,
    i18n: { pt: { title: 'Meu título' }, en: { title: 'My title' } },
  } as never

  it('cita o título do post e diz que não tem volta', () => {
    const q = deleteQuestion(base)
    expect(q).toMatch(/Meu título/)
    expect(q).toMatch(/não dá para desfazer/i)
  })

  it('sem título em português usa o inglês; sem nenhum, diz que é sem título', () => {
    expect(deleteQuestion({ ...(base as object), i18n: { pt: { title: '' }, en: { title: 'Only EN' } } } as never)).toMatch(/Only EN/)
    expect(deleteQuestion({ ...(base as object), i18n: { pt: { title: '' }, en: { title: '' } } } as never)).toMatch(/sem título/i)
  })

  it('post no ar avisa que sai do site na hora', () => {
    expect(deleteQuestion({ ...(base as object), status: 'published' } as never)).toMatch(/está no ar.*sai do site/i)
  })

  it('post agendado avisa que não vai mais ao ar', () => {
    expect(deleteQuestion({ ...(base as object), status: 'scheduled' } as never)).toMatch(/agendado.*não será publicado/i)
  })

  it('rascunho não traz aviso de site', () => {
    expect(deleteQuestion(base)).not.toMatch(/no ar|agendado/i)
  })

  it('post que já foi ao LinkedIn avisa que lá ele continua', () => {
    const q = deleteQuestion({ ...(base as object), status: 'published', linkedinPostedAt: '2026-09-15T12:00:00Z' } as never)
    expect(q).toMatch(/continua no linkedin/i)
    expect(q).toMatch(/15\/09\/2026/)
  })
})

describe('statusLabel — o estado em português, como o autor fala', () => {
  it.each([['draft', 'rascunho'], ['scheduled', 'agendado'], ['published', 'no ar']])('%s → %s', (status, label) => {
    expect(statusLabel(status as never)).toBe(label)
  })
})

describe('formatDay — dia no formato brasileiro', () => {
  it('ISO vira dd/mm/aaaa', () => expect(formatDay('2026-09-15T12:00:00Z')).toBe('15/09/2026'))
  it('vazio vira traço', () => expect(formatDay(null)).toBe('—'))
})

describe('hasUnsavedChanges — só texto e tags contam como "não salvo"', () => {
  const post = (over = {}) => ({
    id: '1', tags: ['ia'], status: 'draft',
    i18n: { pt: { title: 'A', excerpt: '', sections: [] }, en: { title: 'B', excerpt: '', sections: [] } },
    ...over,
  }) as never

  it('igual ao salvo: limpo', () => expect(hasUnsavedChanges(post(), post())).toBe(false))

  it('título diferente: sujo', () => {
    const edited = post({ i18n: { pt: { title: 'A!', excerpt: '', sections: [] }, en: { title: 'B', excerpt: '', sections: [] } } })
    expect(hasUnsavedChanges(edited, post())).toBe(true)
  })

  it('tag nova: sujo', () => expect(hasUnsavedChanges(post({ tags: ['ia', 'x'] }), post())).toBe(true))

  it('mudar estado ou capa não é edição de texto', () => {
    expect(hasUnsavedChanges(post({ status: 'published', image: { hash: 'x' } }), post())).toBe(false)
  })
})
