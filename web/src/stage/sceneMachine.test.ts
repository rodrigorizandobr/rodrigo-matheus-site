import { describe, it, expect } from 'vitest'
import { reduce, initial, resolveActive, type StageState } from './sceneMachine'

describe('resolveActive — qual seção manda no palco', () => {
  it('escolhe a seção cuja faixa central está mais visível; hero por padrão', () => {
    expect(resolveActive([], 'hero')).toBe('hero')
    expect(resolveActive([{ id: 'about', ratio: 0.2 }, { id: 'experience', ratio: 0.6 }], 'hero')).toBe('experience')
  })
  it('mantém a anterior quando nada está visível o suficiente', () => {
    expect(resolveActive([{ id: 'about', ratio: 0.04 }], 'projects')).toBe('projects')
  })
})

describe('reduce — repouso → zoom até a parte → loop → zoom de volta → repouso', () => {
  const rest: StageState = initial('hero')

  it('começa em repouso, sem cena', () => {
    expect(rest).toEqual({ phase: 'rest', scene: null, pending: null })
  })
  it('foco numa seção a partir do repouso inicia o ZOOM-IN para ela', () => {
    expect(reduce(rest, { type: 'focus', section: 'about' })).toEqual({ phase: 'zoomIn', scene: 'about', pending: null })
  })
  it('zoom-in concluído → SHOW (o loop da parte fica visível)', () => {
    const s = reduce(rest, { type: 'focus', section: 'about' })
    expect(reduce(s, { type: 'zoomed' })).toEqual({ phase: 'show', scene: 'about', pending: null })
  })
  it('trocar de seção durante SHOW inicia o ZOOM-OUT guardando o destino', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'projects' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'projects' })
  })
  it('zoom-out concluído com destino → HOLD no repouso (o olho registra o retorno) → ZOOM-IN no destino', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    const hold = reduce(out, { type: 'rested' })
    expect(hold).toEqual({ phase: 'hold', scene: null, pending: 'projects' })
    expect(reduce(hold, { type: 'held' })).toEqual({ phase: 'zoomIn', scene: 'projects', pending: null })
  })
  it('durante o HOLD, voltar ao hero cancela; outra seção troca o destino', () => {
    const hold: StageState = { phase: 'hold', scene: null, pending: 'projects' }
    expect(reduce(hold, { type: 'focus', section: 'hero' })).toEqual({ phase: 'rest', scene: null, pending: null })
    expect(reduce(hold, { type: 'focus', section: 'contact' })).toEqual({ phase: 'hold', scene: null, pending: 'contact' })
  })
  it('zoom-out concluído sem destino (voltou ao hero) → repouso', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: null }
    expect(reduce(out, { type: 'rested' })).toEqual({ phase: 'rest', scene: null, pending: null })
  })
  it('voltar ao hero durante SHOW é zoom-out sem pendência', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'hero' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: null })
  })
  it('mudar de ideia durante o zoom-out só troca o destino (uma transição, não duas)', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    expect(reduce(out, { type: 'focus', section: 'contact' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'contact' })
  })
  it('mudar de ideia durante o zoom-in: termina o zoom, depois sai para o novo destino', () => {
    const zin: StageState = { phase: 'zoomIn', scene: 'about', pending: null }
    const s1 = reduce(zin, { type: 'focus', section: 'projects' })
    expect(s1).toEqual({ phase: 'zoomIn', scene: 'about', pending: 'projects' })
    expect(reduce(s1, { type: 'zoomed' })).toEqual({ phase: 'zoomOut', scene: 'about', pending: 'projects' })
  })
  it('foco na seção já exibida não faz nada', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'about' })).toBe(show)
  })
  it('voltar para a mesma seção durante o zoom-out cancela a saída', () => {
    const out: StageState = { phase: 'zoomOut', scene: 'about', pending: 'projects' }
    expect(reduce(out, { type: 'focus', section: 'about' })).toEqual({ phase: 'zoomIn', scene: 'about', pending: null })
  })
})

describe('reduce — a câmera anda de parte em parte até o destino', () => {
  // ordem real: about(olhos) experience(pescoço) projects(coração) education(cérebro) blog(punho) contact(mãos)
  const ORDEM = ['about', 'experience', 'projects', 'education', 'blog', 'contact']
  const step = (from: string, to: string) => {
    const a = ORDEM.indexOf(from), b = ORDEM.indexOf(to)
    if (a < 0 || b < 0 || a === b) return null
    return ORDEM[a + (b > a ? 1 : -1)]
  }

  it('vizinha: vai direto, lembrando de onde veio', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'experience' }, step))
      .toEqual({ phase: 'zoomIn', scene: 'experience', from: 'about', pending: null })
  })

  it('destino longe: anda o PRIMEIRO passo e guarda o destino final', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'contact' }, step))
      .toEqual({ phase: 'zoomIn', scene: 'experience', from: 'about', pending: 'contact' })
  })

  it('ao pousar, emenda o próximo trecho sem voltar ao busto', () => {
    const chegou: StageState = { phase: 'zoomIn', scene: 'experience', from: 'about', pending: 'contact' }
    expect(reduce(chegou, { type: 'zoomed' }, step))
      .toEqual({ phase: 'zoomIn', scene: 'projects', from: 'experience', pending: 'contact' })
  })

  it('o último passo limpa o destino e o palco assenta', () => {
    const quase: StageState = { phase: 'zoomIn', scene: 'blog', from: 'education', pending: 'contact' }
    const ultimo = reduce(quase, { type: 'zoomed' }, step)
    expect(ultimo).toEqual({ phase: 'zoomIn', scene: 'contact', from: 'blog', pending: null })
    expect(reduce(ultimo, { type: 'zoomed' }, step)).toEqual({ phase: 'show', scene: 'contact', pending: null })
  })

  it('a VOLTA refaz o caminho inteiro, parte por parte', () => {
    let estado: StageState = { phase: 'show', scene: 'contact', pending: null }
    estado = reduce(estado, { type: 'focus', section: 'about' }, step)
    const visitadas = [estado.scene]
    while (estado.phase === 'zoomIn') {
      estado = reduce(estado, { type: 'zoomed' }, step)
      if (estado.phase === 'zoomIn') visitadas.push(estado.scene)
    }
    expect(visitadas).toEqual(['blog', 'education', 'projects', 'experience', 'about'])
    expect(estado).toEqual({ phase: 'show', scene: 'about', pending: null })
  })

  it('mudar de ideia no meio do caminho vira o sentido da viagem', () => {
    const indo: StageState = { phase: 'zoomIn', scene: 'projects', from: 'experience', pending: 'contact' }
    const virou = reduce(indo, { type: 'focus', section: 'about' }, step)
    expect(virou.pending).toBe('about')
    // ao pousar em projects, o próximo passo já é para TRÁS; about ainda está a dois passos
    expect(reduce(virou, { type: 'zoomed' }, step))
      .toEqual({ phase: 'zoomIn', scene: 'experience', from: 'projects', pending: 'about' })
  })

  it('voltar ao topo continua passando pelo busto — é o clipe que existe', () => {
    const show: StageState = { phase: 'show', scene: 'contact', pending: null }
    expect(reduce(show, { type: 'focus', section: 'hero' }, step))
      .toEqual({ phase: 'zoomOut', scene: 'contact', pending: null })
  })

  it('sem resolvedor de passo (padrão) tudo passa pelo busto', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'experience' }))
      .toEqual({ phase: 'zoomOut', scene: 'about', pending: 'experience' })
  })
})

describe('reduce — rolar TUDO de uma vez até o topo (bug reportado pelo PO)', () => {
  const ORDEM = ['hero', 'about', 'experience', 'projects', 'education', 'blog', 'contact']
  /** mesmo cálculo de scenes.stepToward, incluindo a volta ao busto */
  const step = (from: string, to: string) => {
    const a = ORDEM.indexOf(from), b = ORDEM.indexOf(to)
    if (a <= 0 || b < 0 || a === b) return null
    const next = ORDEM[a + (b > a ? 1 : -1)]
    return next === 'hero' ? null : next
  }
  /** aplica os focos na ordem em que a rolagem rápida os dispara */
  const focar = (inicial: StageState, secoes: string[]) =>
    secoes.reduce((st, section) => reduce(st, { type: 'focus', section }, step), inicial)

  it('rolagem rápida até o topo ainda refaz o caminho inteiro', () => {
    // o usuário está na última seção e sobe tudo de uma vez: os focos chegam em rajada,
    // e o ÚLTIMO é o topo da página
    let estado = focar({ phase: 'show', scene: 'contact', pending: null },
                       ['blog', 'education', 'projects', 'experience', 'about', 'hero'])

    const visitadas: string[] = []
    for (let i = 0; i < 12 && estado.phase === 'zoomIn'; i++) {
      visitadas.push(estado.scene!)
      estado = reduce(estado, { type: 'zoomed' }, step)
    }
    expect(visitadas).toEqual(['blog', 'education', 'projects', 'experience', 'about'])
    expect(estado.phase).toBe('zoomOut')
    expect(estado.scene).toBe('about')
  })

  it('e termina no repouso, sem cena presa', () => {
    let estado = focar({ phase: 'show', scene: 'contact', pending: null },
                       ['blog', 'education', 'projects', 'experience', 'about', 'hero'])
    for (let i = 0; i < 12 && estado.phase === 'zoomIn'; i++) estado = reduce(estado, { type: 'zoomed' }, step)
    expect(reduce(estado, { type: 'rested' }, step)).toEqual({ phase: 'rest', scene: null, pending: null })
  })

  it('rolagem rápida até o meio da página também anda o caminho', () => {
    let estado = focar({ phase: 'show', scene: 'contact', pending: null },
                       ['blog', 'education', 'projects'])
    const visitadas: string[] = []
    for (let i = 0; i < 12 && estado.phase === 'zoomIn'; i++) {
      visitadas.push(estado.scene!)
      estado = reduce(estado, { type: 'zoomed' }, step)
    }
    expect(visitadas).toEqual(['blog', 'education', 'projects'])
    expect(estado).toEqual({ phase: 'show', scene: 'projects', pending: null })
  })

  it('descer tudo de uma vez a partir do repouso também percorre as partes', () => {
    let estado = focar({ phase: 'rest', scene: null, pending: null },
                       ['about', 'experience', 'projects', 'education', 'blog', 'contact'])
    const visitadas: string[] = []
    for (let i = 0; i < 12 && estado.phase === 'zoomIn'; i++) {
      visitadas.push(estado.scene!)
      estado = reduce(estado, { type: 'zoomed' }, step)
    }
    expect(visitadas).toEqual(['about', 'experience', 'projects', 'education', 'blog', 'contact'])
  })

  it('voltar ao topo já estando na PRIMEIRA parte é o clipe parte → busto, sem rodeio', () => {
    const show: StageState = { phase: 'show', scene: 'about', pending: null }
    expect(reduce(show, { type: 'focus', section: 'hero' }, step))
      .toEqual({ phase: 'zoomOut', scene: 'about', pending: null })
  })
})
