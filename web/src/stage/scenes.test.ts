import { describe, it, expect } from 'vitest'
import { sceneFor, transitionSrc, videoSrc, linkSrc, isNeighbour, stepToward, SCENES } from './scenes'

describe('scenes — fontes de vídeo por dispositivo', () => {
  it('loop: desktop vs mobile', () => {
    expect(videoSrc(sceneFor('projects')).mp4).toBe('/scenes/core.mp4')
    expect(videoSrc(sceneFor('projects'), true).mp4).toBe('/scenes/core.m.mp4')
  })
  it('transição: ida e volta, desktop e mobile', () => {
    expect(transitionSrc(sceneFor('about'), 'in')).toEqual({ webm: '/scenes/eyes-in.webm', mp4: '/scenes/eyes-in.mp4' })
    expect(transitionSrc(sceneFor('about'), 'out', true)).toEqual({ mp4: '/scenes/eyes-out.m.mp4' })
  })
  it('mobile só recebe mp4 (H.264 decodifica por hardware em qualquer celular; VP9 costuma ir para software e engasga)', () => {
    expect(videoSrc(sceneFor('hero'), true)).toEqual({ mp4: '/hero/idle.m.mp4' })
    expect(videoSrc(sceneFor('about'), true)).not.toHaveProperty('webm')
    expect(videoSrc(sceneFor('about')).webm).toBe('/scenes/eyes.webm')
  })
  it('LOGS examina o punho; nenhuma cena reutiliza parte de outra', () => {
    expect(sceneFor('blog').part).toBe('fist')
    const parts = SCENES.map((s) => s.part)
    expect(new Set(parts).size).toBe(parts.length)
  })
})

describe('scenes — clipes parte → parte entre seções vizinhas', () => {
  it('vizinhas na ordem de leitura são ligadas; hero não (ele usa o clipe busto → parte)', () => {
    expect(isNeighbour('about', 'experience')).toBe(true)
    expect(isNeighbour('experience', 'about')).toBe(true)
    expect(isNeighbour('about', 'projects')).toBe(false)
    expect(isNeighbour('hero', 'about')).toBe(false)
    expect(isNeighbour('about', 'about')).toBe(false)
  })
  it('linkSrc nomeia o clipe pela origem e destino (a volta é o arquivo invertido)', () => {
    expect(linkSrc(sceneFor('about'), sceneFor('experience'))).toEqual({ webm: '/scenes/eyes-neck.webm', mp4: '/scenes/eyes-neck.mp4' })
    expect(linkSrc(sceneFor('experience'), sceneFor('about'), true)).toEqual({ mp4: '/scenes/neck-eyes.m.mp4' })
  })
})


describe('stepToward — a câmera anda de parte em parte, nunca teleporta', () => {
  it('vizinha imediata é o próprio destino', () => {
    expect(stepToward('about', 'experience')).toBe('experience')
    expect(stepToward('experience', 'about')).toBe('about')
  })

  it('destino longe devolve só o PRÓXIMO passo, no sentido certo', () => {
    // about(olhos) → contact(mãos): o primeiro passo é experience(pescoço)
    expect(stepToward('about', 'contact')).toBe('experience')
    // e na volta, o primeiro passo é blog(punho)
    expect(stepToward('contact', 'about')).toBe('blog')
  })

  it('o caminho inteiro de volta passa por todas as partes', () => {
    const caminho: string[] = []
    let atual = 'contact'
    while (atual !== 'about') {
      atual = stepToward(atual, 'about')!
      caminho.push(atual)
    }
    expect(caminho).toEqual(['blog', 'education', 'projects', 'experience', 'about'])
  })

  it('voltar ao topo ANDA de volta pelas partes, uma a uma', () => {
    expect(stepToward('contact', 'hero')).toBe('blog')
    expect(stepToward('experience', 'hero')).toBe('about')
  })

  it('só na PRIMEIRA parte é que o topo vira o clipe parte → busto', () => {
    expect(stepToward('about', 'hero')).toBeNull()
  })

  it('sair do hero também não tem passo — é o clipe busto → parte', () => {
    expect(stepToward('hero', 'about')).toBeNull()
  })

  it('mesmo lugar não anda', () => {
    expect(stepToward('about', 'about')).toBeNull()
  })

  it('seção desconhecida não quebra', () => {
    expect(stepToward('about', 'inexistente')).toBeNull()
  })
})
