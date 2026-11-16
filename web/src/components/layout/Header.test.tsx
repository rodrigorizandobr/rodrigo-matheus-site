import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../../i18n/useI18n'
import { Header } from './Header'

const scrollToId = vi.hoisted(() => vi.fn())
vi.mock('../../motion/lenis', () => ({ scrollToId, initSmoothScroll: vi.fn() }))

const r = () => render(<I18nProvider><Header /></I18nProvider>)
const abrirMenu = async () => {
  r()
  await userEvent.click(screen.getByRole('button', { name: /Open menu/ }))
  return screen.getByRole('dialog', { name: 'Menu' })
}

const irPara = (pathname: string) => window.history.replaceState({}, '', pathname)

beforeEach(() => { scrollToId.mockClear(); irPara('/') })
afterEach(() => { document.documentElement.style.overflow = ''; document.body.style.overflow = '' })

describe('Header — menu mobile', () => {
  it('botão de menu abre a folha com os links e fecha com Escape', async () => {
    r()
    const btn = screen.getByRole('button', { name: /Open menu/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(btn)
    expect(within(screen.getByRole('banner')).getByRole('button', { name: /Close menu/ }))
      .toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('menu mobile — o botão de fechar não pode sumir', () => {
  it('abrir o menu NÃO trava a rolagem do documento', async () => {
    // `overflow: hidden` no <html> desgruda o header sticky: com a página rolada ele
    // salta para fora da tela e leva o X junto — o menu fica sem como fechar
    await abrirMenu()
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
  })

  it('o menu também oferece um fechar próprio, caso o cabeçalho saia de vista', async () => {
    const menu = await abrirMenu()
    await userEvent.click(within(menu).getByRole('button', { name: /Close menu/ }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })
})

describe('navegação — blog, utilitários e currículo, em qualquer página', () => {
  it('a marca leva à home e é o ponto de onde o fio condutor sai', () => {
    r()
    const marca = within(screen.getByRole('banner')).getByRole('link', { name: /Rodrigo Matheus/ })
    expect(marca).toHaveAttribute('href', '/')
    expect(marca.querySelector('[data-fio="mark"]')).not.toBeNull()
  })

  it('o link do blog leva ao blog em qualquer página', async () => {
    const menu = await abrirMenu()
    expect(within(menu).getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog/')
  })

  it('o currículo tem página própria: as seções de carreira saíram da home', async () => {
    irPara('/blog')
    const menu = await abrirMenu()
    expect(within(menu).getByRole('link', { name: /currículo|résumé/i })).toHaveAttribute('href', '/curriculo')
  })

  it('os links são do navegador: nada de rolagem interceptada', async () => {
    const menu = await abrirMenu()
    const link = within(menu).getByRole('link', { name: /currículo|résumé/i })
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
    expect(scrollToId).not.toHaveBeenCalled()
  })

  it('a navegação do desktop tem os mesmos destinos', () => {
    r()
    const nav = screen.getAllByRole('navigation', { name: 'Sections' })[0]
    expect(within(nav).getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog/')
    expect(within(nav).getByRole('link', { name: /currículo|résumé/i })).toHaveAttribute('href', '/curriculo')
    expect(within(nav).getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', expect.stringContaining('linkedin.com/in/'))
  })

  it('o cabeçalho é opaco: o fio passa por baixo dele sem aparecer', () => {
    r()
    expect(screen.getByRole('banner').className).toMatch(/\bbg-bg\b/)
  })
})

describe('Utilitários — submenu de formulários avulsos', () => {
  it('no desktop, "Utilitários" não navega sozinho; o submenu tem Vivendo de Imóveis e Previdência Privada', () => {
    r()
    const nav = screen.getAllByRole('navigation', { name: 'Sections' })[0]
    expect(within(nav).getByRole('button', { name: /utilitários|tools/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /vivendo de imóveis/i })).toHaveAttribute('href', '/vivendo-de-imoveis')
    expect(within(nav).getByRole('link', { name: /previdência privada/i })).toHaveAttribute('href', '/previdencia-privada')
  })

  it('no menu mobile, os itens de Utilitários entram direto, sem precisar de hover', async () => {
    const menu = await abrirMenu()
    expect(within(menu).getByText(/^(utilitários|tools)$/i)).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: /vivendo de imóveis/i })).toHaveAttribute('href', '/vivendo-de-imoveis')
    expect(within(menu).getByRole('link', { name: /previdência privada/i })).toHaveAttribute('href', '/previdencia-privada')
  })

  it('clicar no item do mobile fecha a folha', async () => {
    const menu = await abrirMenu()
    await userEvent.click(within(menu).getByRole('link', { name: /vivendo de imóveis/i }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })
})
