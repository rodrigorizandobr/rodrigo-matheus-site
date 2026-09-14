import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../../i18n/useI18n'
import { Header } from './Header'

describe('Header — menu mobile', () => {
  it('botão de menu abre a folha com os links e fecha com Escape', async () => {
    render(<I18nProvider><Header /></I18nProvider>)
    const btn = screen.getByRole('button', { name: /Open menu/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: /Close menu/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
