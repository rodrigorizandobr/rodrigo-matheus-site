import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkedInAlert } from './LinkedInAlert'
import type { LinkedInStatus } from '../../blog/types'

const paint = (status: LinkedInStatus | null, enabled = true, onReconnect = vi.fn()) => {
  render(<LinkedInAlert status={status} sharingEnabled={enabled} onReconnect={onReconnect} />)
  return onReconnect
}

describe('LinkedInAlert — a régua aparece em qualquer aba do painel', () => {
  it('autorização folgada não vira ruído', () => {
    paint({ connected: true, hasApp: true, daysLeft: 40 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a partir de 15 dias avisa, ainda sem alarme', () => {
    paint({ connected: true, hasApp: true, daysLeft: 15 })
    const faixa = screen.getByRole('status')
    expect(faixa.textContent).toMatch(/vence em 15 dias/i)
    expect(faixa.dataset.level).toBe('warn')
  })

  it('a 7 dias o alarme fica vermelho', () => {
    paint({ connected: true, hasApp: true, daysLeft: 7 })
    expect(screen.getByRole('status').dataset.level).toBe('danger')
  })

  it('vencida, diz o que parou — não só que venceu', () => {
    paint({ connected: true, hasApp: true, daysLeft: -2 })
    expect(screen.getByRole('status').textContent).toMatch(/parou/i)
  })

  it('compartilhamento ligado sem conta conectada é falha silenciosa: avisa', () => {
    paint({ connected: false, hasApp: true }, true)
    expect(screen.getByRole('status').textContent).toMatch(/nenhum post está indo/i)
  })

  it('compartilhamento desligado de propósito não é problema', () => {
    paint({ connected: false, hasApp: true }, false)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sem status carregado ainda, nada aparece', () => {
    paint(null)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a faixa leva direto para a renovação, que é um clique', async () => {
    const onReconnect = paint({ connected: true, hasApp: true, daysLeft: 3 })
    await userEvent.click(screen.getByRole('button', { name: /reconectar/i }))
    expect(onReconnect).toHaveBeenCalled()
  })
})
