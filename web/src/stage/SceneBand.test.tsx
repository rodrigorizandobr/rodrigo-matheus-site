import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneBand } from './SceneBand'
import { videoSrc, sceneFor } from './scenes'

describe('SceneBand — a faixa mobile também anima', () => {
  it('cena com loop renderiza <video> mudo, inline, em loop, com poster e fontes mobile', () => {
    const { container } = render(<SceneBand section="projects" />)
    const v = container.querySelector('video')!
    expect(v).not.toBeNull()
    expect(v.muted).toBe(true)
    expect(v.loop).toBe(true)
    expect(v.getAttribute('playsinline')).not.toBeNull()
    expect(v.getAttribute('preload')).toBe('none')
    const srcs = [...v.querySelectorAll('source')].map((s) => s.getAttribute('src'))
    expect(srcs).toEqual(['/scenes/core.m.webm', '/scenes/core.m.mp4'])
  })
  it('cena marcada video:false (boca) fica só com o poster', () => {
    const { container } = render(<SceneBand section="blog" />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toContain('mouth')
  })
})

describe('videoSrc — desktop e mobile apontam para encodes diferentes', () => {
  it('hero: idle vs idle.m', () => {
    expect(videoSrc(sceneFor('hero'))).toEqual({ webm: '/hero/idle.webm', mp4: '/hero/idle.mp4' })
    expect(videoSrc(sceneFor('hero'), true)).toEqual({ webm: '/hero/idle.m.webm', mp4: '/hero/idle.m.mp4' })
  })
  it('cena: <part> vs <part>.m', () => {
    expect(videoSrc(sceneFor('about'), true).mp4).toBe('/scenes/eyes.m.mp4')
  })
})
