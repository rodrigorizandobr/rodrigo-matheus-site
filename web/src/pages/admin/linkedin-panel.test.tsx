import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkedInPanel } from './LinkedInPanel'
import type { BlogConfig, LinkedInStatus } from '../../blog/types'

const config = (over: Partial<BlogConfig> = {}): BlogConfig => ({
  timezone: 'America/Sao_Paulo', auto_publish: false, delay_days: 2, publish_hour: 8,
  generate_hour: 6, generate_weekdays: [0, 3], research_enabled: true, news_terms: ['ia'],
  linkedin_enabled: true, ...over,
})

const api = (status: LinkedInStatus, over: Partial<Parameters<typeof LinkedInPanel>[0]['api']> = {}) => ({
  status: vi.fn().mockResolvedValue(status),
  connect: vi.fn().mockResolvedValue('https://linkedin.com/oauth'),
  disconnect: vi.fn().mockResolvedValue({}),
  saveApp: vi.fn().mockResolvedValue({ connected: false, hasApp: true }),
  shareNow: vi.fn().mockResolvedValue(null),
  testAlert: vi.fn().mockResolvedValue({ sent: true, configured: true, reason: '' }),
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

  it('não tem mais dia ou hora próprios: a agenda é a mesma da geração, só o interruptor fica aqui', async () => {
    paint({ connected: true, hasApp: true, daysLeft: 50 })
    expect(screen.queryByRole('button', { name: 'sex' })).toBeNull()
    expect(screen.queryByLabelText(/a partir das.*hora/i)).toBeNull()
    expect(screen.getByText(/mesma agenda/i)).toBeInTheDocument()
  })

  it('salvar manda só o interruptor do LinkedIn', async () => {
    const onSave = vi.fn()
    paint({ connected: true, hasApp: true, daysLeft: 50 }, { onSave })
    await userEvent.click(await screen.findByRole('checkbox', { name: /compartilhar automaticamente/i }))
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    expect(onSave).toHaveBeenCalledWith({ linkedin_enabled: false })
  })

  it('o aviso de teste diz o que aconteceu, inclusive quando não sai', async () => {
    const onMessage = vi.fn()
    const status = { connected: true, hasApp: true, daysLeft: 50, alertsOn: false }
    const client = api(status, { testAlert: vi.fn().mockResolvedValue({ sent: false, configured: false, reason: 'identidade não verificada no SES' }) })
    render(<LinkedInPanel config={config()} api={client} busy={false} status={status}
                          onRefresh={vi.fn()} onConnect={vi.fn()} onSave={vi.fn()} onMessage={onMessage} />)
    await userEvent.click(await screen.findByRole('button', { name: /aviso de teste/i }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('erro', expect.stringMatching(/não verificada no SES/i)))
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

  describe('credenciais do app', () => {
    const REDIRECT = 'https://rodrigomatheus.com.br/api/blog/admin/linkedin/callback'

    it('com app cadastrado, mostra o client id e a URL de retorno — e não o secret', async () => {
      paint({ connected: false, hasApp: true, clientId: 'abc123', redirectUri: REDIRECT })
      expect(await screen.findByText('abc123')).toBeInTheDocument()
      expect(screen.getByText(REDIRECT)).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('client secret')).toBeNull()
    })

    it('mesmo sem app, mostra a URL de retorno: é o que se registra no LinkedIn antes de tudo', async () => {
      paint({ connected: false, hasApp: false, redirectUri: REDIRECT })
      expect(await screen.findByText(REDIRECT)).toBeInTheDocument()
    })

    it('conectado, a seção continua lá — é onde se troca o app', async () => {
      paint({ connected: true, hasApp: true, daysLeft: 40, clientId: 'abc123', redirectUri: REDIRECT })
      expect(await screen.findByRole('button', { name: /trocar credenciais/i })).toBeInTheDocument()
    })

    it('"trocar credenciais" abre os campos, com o client id atual preenchido', async () => {
      paint({ connected: false, hasApp: true, clientId: 'abc123', redirectUri: REDIRECT })
      await userEvent.click(await screen.findByRole('button', { name: /trocar credenciais/i }))
      expect(screen.getByPlaceholderText('client id')).toHaveValue('abc123')
      expect(screen.getByPlaceholderText('client secret')).toHaveValue('')
    })

    it('salvar manda os dois, limpa o secret e fecha os campos', async () => {
      const onRefresh = vi.fn()
      const client = paint({ connected: false, hasApp: true, clientId: 'abc123', redirectUri: REDIRECT }, { onRefresh })
      await userEvent.click(await screen.findByRole('button', { name: /trocar credenciais/i }))
      const id = screen.getByPlaceholderText('client id')
      await userEvent.clear(id)
      await userEvent.type(id, 'novo-id')
      await userEvent.type(screen.getByPlaceholderText('client secret'), 'novo-segredo')
      await userEvent.click(screen.getByRole('button', { name: /salvar app/i }))
      await waitFor(() => expect(client.saveApp).toHaveBeenCalledWith('novo-id', 'novo-segredo'))
      await waitFor(() => expect(onRefresh).toHaveBeenCalled())
      expect(screen.queryByPlaceholderText('client secret')).toBeNull()
    })

    it('cancelar fecha os campos sem salvar', async () => {
      const client = paint({ connected: false, hasApp: true, clientId: 'abc123', redirectUri: REDIRECT })
      await userEvent.click(await screen.findByRole('button', { name: /trocar credenciais/i }))
      await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(screen.queryByPlaceholderText('client secret')).toBeNull()
      expect(client.saveApp).not.toHaveBeenCalled()
    })
  })
})
