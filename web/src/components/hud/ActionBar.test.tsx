import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionBar, StartButton } from './ActionBar'
import en from '../../i18n/en.json'

describe('ActionBar — os 3 CTAs do site atual, com os mesmos eventos GA', () => {
  it('LinkedIn, Resume e GitHub apontam para os mesmos destinos de hoje', () => {
    render(<ActionBar hero={en.hero} hud={en.hud} />)
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/in/rodrigorizando/')
    expect(screen.getByRole('link', { name: 'Resume PDF' })).toHaveAttribute('href', '/cv-pt-br.pdf')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/rodrigorizandobr/')
  })

  it('links externos abrem em nova aba com rel seguro', () => {
    render(<ActionBar hero={en.hero} hud={en.hud} />)
    const li = screen.getByRole('link', { name: 'LinkedIn' })
    expect(li).toHaveAttribute('target', '_blank')
    expect(li).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('clique dispara hero_click {button} — paridade com v2', async () => {
    render(<ActionBar hero={en.hero} hud={en.hud} />)
    await userEvent.click(screen.getByRole('link', { name: 'GitHub' }))
    expect(window.gtag).toHaveBeenCalledWith('event', 'hero_click', { button: 'GitHub', language: 'en' })
  })
})

describe('StartButton — o START da tela de seleção', () => {
  it('renderiza o label do HUD e ao clicar chama onStart + cta_start', async () => {
    const onStart = vi.fn()
    render(<StartButton label={en.hud.start} onStart={onStart} />)
    await userEvent.click(screen.getByRole('button', { name: /START/ }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(window.gtag).toHaveBeenCalledWith('event', 'cta_start', { language: 'en' })
  })
})
