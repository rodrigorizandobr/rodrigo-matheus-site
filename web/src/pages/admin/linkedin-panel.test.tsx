import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkedInPanel } from './LinkedInPanel'
import type { BlogConfig, LinkedInStatus } from '../../blog/types'

const config = (over: Partial<BlogConfig> = {}): BlogConfig => ({
  timezone: 'America/Sao_Paulo', auto_publish: false, delay_days: 2, publish_hour: 8,
  generate_hour: 6, generate_weekdays: [0, 3], research_enabled: true, news_terms: ['ia'],
  linkedin_enabled: true, linkedin_weekdays: [1, 3], linkedin_hour: 9, ...over,
})

const api = (status: LinkedInStatus, over: Partial<Parameters<typeof LinkedInPanel>[0]['api']> = {}) => ({
  status: vi.fn().mockResolvedValue(status),
  connect: vi.fn().mockResolvedValue('https://linkedin.com/oauth'),
  disconnect: vi.fn().mockResolvedValue({}),
  saveApp: vi.fn().mockResolvedValue({ connected: false, hasApp: true }),
  shareNow: vi.fn().mockResolvedValue(null),
  testAlert: vi.fn().mockResolvedValue({ sent: true, configured: true }),
  ...over,
})

const paint = (status: LinkedInStatus, props: Partial<Parameters<typeof LinkedInPanel>[0]> = {}) => {
  const client = api(status)
  render(<LinkedInPanel config={config()} api={client} busy={false} status={status}
                       onRefresh={props.onRefresh ?? vi.fn()} onConnect={props.onConnect ?? vi.fn()}
                       onSave={props.onSave ?? vi.fn()} onMessage={props.onMessage ?? vi.fn()} />)
  return client
}

describe('LinkedInPanel', () => {
  it('sem app cadastrado, pede client id e secret — não adianta oferecer "conectar"', async () => {
    paint({ connected: false, hasApp: false })
    await screen.findByPlaceholderText('client id')
    expect(screen.getByPlaceholderText('client secret')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('button', { name: /conectar conta/i })).toBeNull()
  })

  it('com app e sem conta conectada, oferece conectar', async () => {
    paint({ connected: false, hasApp: true })
    expect(await screen.findByRole('button', { name: /conectar conta/i })).toBeTruthy()
    expect(screen.queryByPlaceholderText('client id')).toBeNull()
  })

  it('avisa quando a autorização está perto de vencer — sem refresh, ela morre calada', async () => {
    paint({ connected: true, hasApp: true, daysLeft: 7 })
    const aviso = await screen.findByText(/vence em 7 dias/i)
    expect(aviso.className).toContain('text-red')
  })

  it('autorização longe do vencimento não vira alarme', async () => {
    paint({ connected: true, hasApp: true, daysLeft: 45 })
    const aviso = await screen.findByText(/vence em 45 dias/i)
    expect(aviso.className).not.toContain('text-red')
  })

  it('salvar agenda manda só os campos do LinkedIn, com os dias que foram clicados', async () => {
    const onSave = vi.fn()
    paint({ connected: true, hasApp: true, daysLeft: 50 }, { onSave })
    await userEvent.click(await screen.findByRole('button', { name: 'sex' }))
    await userEvent.click(screen.getByRole('button', { name: /salvar agenda/i }))
    expect(onSave).toHaveBeenCalledWith({
      linkedin_enabled: true, linkedin_weekdays: [1, 3, 4], linkedin_hour: 9,
    })
  })

  it('o aviso de teste diz o que aconteceu, inclusive quando não sai', async () => {
    const onMessage = vi.fn()
    const status = { connected: true, hasApp: true, daysLeft: 50, alertsOn: false }
    const client = api(status, { testAlert: vi.fn().mockResolvedValue({ sent: false, configured: false }) })
    render(<LinkedInPanel config={config()} api={client} busy={false} status={status}
                          onRefresh={vi.fn()} onConnect={vi.fn()} onSave={vi.fn()} onMessage={onMessage} />)
    await userEvent.click(await screen.findByRole('button', { name: /aviso de teste/i }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('erro', expect.stringMatching(/não saiu/i)))
  })

  it('a régua se explica: diz quando avisa e por onde', async () => {
    paint({ connected: true, hasApp: true, daysLeft: 50, alertsOn: true })
    expect((await screen.findByText(/régua de avisos/i)).parentElement?.textContent)
      .toMatch(/30, 15, 7, 3 e 1 dia/i)
  })

  it('"compartilhar agora" com a fila vazia explica em vez de mentir que publicou', async () => {
    const onMessage = vi.fn()
    const status = { connected: true, hasApp: true, daysLeft: 50 }
    const client = api(status)
    render(<LinkedInPanel config={config()} api={client} busy={false} status={status}
                          onRefresh={vi.fn()} onConnect={vi.fn()} onSave={vi.fn()} onMessage={onMessage} />)
    await userEvent.click(await screen.findByRole('button', { name: /compartilhar o próximo agora/i }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('ok', expect.stringMatching(/fila está vazia/i)))
  })

  it('erro do servidor aparece para a pessoa, não some no console', async () => {
    const onMessage = vi.fn()
    const status = { connected: true, hasApp: true, daysLeft: 50 }
    const client = api(status,
      { shareNow: vi.fn().mockRejectedValue(new Error('conecte a conta do LinkedIn no painel')) })
    render(<LinkedInPanel config={config()} api={client} busy={false} status={status}
                          onRefresh={vi.fn()} onConnect={vi.fn()} onSave={vi.fn()} onMessage={onMessage} />)
    await userEvent.click(await screen.findByRole('button', { name: /compartilhar o próximo agora/i }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('erro', 'conecte a conta do LinkedIn no painel'))
  })
})
