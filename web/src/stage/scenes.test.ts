import { describe, it, expect } from 'vitest'
import { sceneFor, transitionSrc, videoSrc, SCENES } from './scenes'

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
