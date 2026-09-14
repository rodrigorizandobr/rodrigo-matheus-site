import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n/useI18n'
import en from '../../i18n/en.json'
import { About } from './About'
import { Campaigns } from './Campaigns'
import { Arena } from './Arena'
import { Training } from './Training'
import { Contact } from './Contact'
import { Logs } from './Logs'
import { resetArenaCache } from '../../hooks/useArena'

const wrap = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
const r = (ui: ReactNode) => render(ui, { wrapper: wrap })

beforeEach(() => resetArenaCache())
afterEach(() => vi.unstubAllGlobals())

describe('About — BIO', () => {
  it('foto real, lead e as 10 skills do CV', () => {
    r(<About />)
    expect(screen.getByRole('img', { name: /Rodrigo Matheus/ })).toHaveAttribute('src', expect.stringContaining('rodrigo-800.webp'))
    expect(screen.getByText(en.about.lead.slice(0, 40), { exact: false })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: /SKILL TREE/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
  })
  it('ficha de campo repete os 3 números do hero (mesma fonte: i18n)', () => {
    r(<About />)
    for (const s of en.hero.stats) expect(screen.getByText(s.value)).toBeInTheDocument()
  })
})

describe('Campaigns — 16 experiências', () => {
  it('renderiza 16 cards, o primeiro como ATIVA, em ordem do i18n', () => {
    r(<Campaigns />)
    const items = screen.getAllByRole('article')
    expect(items).toHaveLength(16)
    expect(within(items[0]).getByText('ACTIVE')).toBeInTheDocument()
    expect(within(items[0]).getByText('banQi — Casas Bahia')).toBeInTheDocument()
    expect(within(items[15]).queryByText('ACTIVE')).toBeNull()
  })
})

describe('Arena — repos do GitHub', () => {
  const repo = (n: string, over: Record<string, unknown> = {}) => ({
    name: n, html_url: `https://github.com/rodrigorizandobr/${n}`, description: `about ${n}`, language: 'Python', topics: [],
    stargazers_count: 0, forks_count: 0, pushed_at: new Date().toISOString(),
    sparkline: { days: new Array(28).fill(1), commits: 28 }, commits: [{ sha: 'abc1234', date: new Date().toISOString(), message: 'first' }], ...over,
  })
  it('loading: esqueletos e sem cards', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    r(<Arena />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByRole('article')).toBeNull()
  })
  it('offline: mensagem + botão RETRY que refaz o fetch', async () => {
    const f = vi.fn(async () => new Response('x', { status: 500 }))
    vi.stubGlobal('fetch', f)
    r(<Arena />)
    await waitFor(() => expect(screen.getByText('ARENA OFFLINE')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /RETRY/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
  })
  it('vazio: mensagem de vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ repos: [] }), { status: 200 })))
    r(<Arena />)
    await waitFor(() => expect(screen.getByText(en.sections.projects.empty)).toBeInTheDocument())
  })
  it('cards: raridade por stars, cor por linguagem, sparkline, expandir commits, GA nos links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ repos: [repo('alpha'), repo('beta', { stargazers_count: 12 })] }), { status: 200 })))
    r(<Arena />)
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[1]).getByText('LEGENDARY')).toBeInTheDocument()
    expect(within(cards[0]).getByText('COMMON')).toBeInTheDocument()
    expect(within(cards[0]).getByTestId('sparkline').querySelector('path')?.getAttribute('d')).toMatch(/^M0,/)
    expect(within(cards[0]).getByTestId('lang-dot')).toHaveStyle({ background: '#3572A5' })
    await userEvent.click(within(cards[0]).getByRole('button', { name: /recent commits/i }))
    expect(within(cards[0]).getByText('abc1234')).toBeInTheDocument()
    expect(window.gtag).toHaveBeenCalledWith('event', 'repo_card_flip', { repo_name: 'alpha', language: 'en' })
    await userEvent.click(within(cards[0]).getByRole('link', { name: /open repo/i }))
    expect(window.gtag).toHaveBeenCalledWith('event', 'repo_link_click', { repo_name: 'alpha', language: 'en' })
  })
})

describe('Training / Contact / Logs', () => {
  it('Training: 4 formações', () => {
    r(<Training />)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByText(/MBA USP\/Esalq/)).toBeInTheDocument()
  })
  it('Contact: mailto real + GA contact_click', async () => {
    r(<Contact />)
    const mail = screen.getByRole('link', { name: en.contact.btn_email })
    expect(mail).toHaveAttribute('href', 'mailto:rodrigorizando@gmail.com')
    await userEvent.click(mail)
    expect(window.gtag).toHaveBeenCalledWith('event', 'contact_click', { channel: 'email', language: 'en' })
  })
  it('Logs: lista os posts do posts.json no idioma atual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { slug: 'a', date: '2026-04-10', tags: ['cloud'], i18n: { en: { title: 'Post A', summary: 'sum a', body: '<p>x</p>' }, pt: { title: 'Post A pt', summary: 's', body: '' } } },
    ]), { status: 200 })))
    r(<Logs />)
    expect(await screen.findByText('Post A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /READ LOG/ })).toHaveAttribute('href', '/blog/a')
  })
})
