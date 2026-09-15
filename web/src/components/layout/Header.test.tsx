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

describe('menu mobile — os links precisam funcionar em qualquer página', () => {
  it('na home, o link rola a página sem navegar', async () => {
    const menu = await abrirMenu()
    const link = within(menu).getByRole('link', { name: /sobre|about/i })
    expect(link).toHaveAttribute('href', '#about')
    await userEvent.click(link)
    expect(scrollToId).toHaveBeenCalledWith('about')
  })

  it('FORA da home o link aponta para /#secao — senão o clique não faz nada', async () => {
    irPara('/blog')
    const menu = await abrirMenu()
    expect(within(menu).getByRole('link', { name: /sobre|about/i })).toHaveAttribute('href', '/#about')
  })

  it('fora da home o clique NÃO é interceptado: deixa o navegador navegar', async () => {
    irPara('/blog')
    const menu = await abrirMenu()
    const link = within(menu).getByRole('link', { name: /sobre|about/i })
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
    expect(scrollToId).not.toHaveBeenCalled()
  })

  it('o link do blog leva ao blog em qualquer página', async () => {
    const menu = await abrirMenu()
    expect(within(menu).getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog/')
  })

  it('a navegação do desktop segue a mesma regra', () => {
    irPara('/blog')
    r()
    const nav = screen.getAllByRole('navigation', { name: 'Sections' })[0]
    expect(within(nav).getByRole('link', { name: /sobre|about/i })).toHaveAttribute('href', '/#about')
  })
})
