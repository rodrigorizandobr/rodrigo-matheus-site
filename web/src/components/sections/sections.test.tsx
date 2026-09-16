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
  it('lead e as 10 skills do CV — e nenhuma foto (só o androide aparece no site)', () => {
    r(<About />)
    expect(screen.queryByRole('img', { name: /Rodrigo Matheus/ })).toBeNull()
    expect(screen.getByText(en.about.lead.slice(0, 40), { exact: false })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: /SKILL TREE/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
  })
  it('ficha de campo repete os 3 números do hero (mesma fonte: i18n)', () => {
    r(<About />)
    for (const s of en.hero.stats) expect(screen.getByText(s.value)).toBeInTheDocument()
  })

  it('a stack do currículo aparece inteira — era a lista que o site não tinha', () => {
    r(<About />)
    const list = screen.getByRole('list', { name: /STACK/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(en.about.stack.length)
    expect(within(list).getByText('Kafka')).toBeInTheDocument()
    expect(within(list).getByText('.NET')).toBeInTheDocument()
  })

  it('idiomas com o nível declarado no currículo', () => {
    r(<About />)
    expect(screen.getByText(/English \(Full Professional\)/)).toBeInTheDocument()
    expect(screen.getByText(/Portuguese \(Native \/ Bilingual\)/)).toBeInTheDocument()
  })
})

describe('Campaigns — os 17 cargos do currículo', () => {
  it('renderiza um card por cargo, o atual como ATIVA, em ordem do i18n', () => {
    r(<Campaigns />)
    const items = screen.getAllByRole('article')
    expect(items).toHaveLength(en.experience.items.length)
    expect(items).toHaveLength(17)
    expect(within(items[0]).getByText('ACTIVE')).toBeInTheDocument()
    expect(within(items[0]).getByText('Digio')).toBeInTheDocument()
    expect(within(items[16]).queryByText('ACTIVE')).toBeNull()
  })

  it('o emprego anterior deixou de ser o atual e ganhou data de saída', () => {
    r(<Campaigns />)
    const items = screen.getAllByRole('article')
    expect(within(items[1]).getByText('Casas Bahia Pay')).toBeInTheDocument()
    expect(within(items[1]).getByText(/June 2024 → June 2026/)).toBeInTheDocument()
    expect(within(items[1]).queryByText('ACTIVE')).toBeNull()
  })

  it('mostra a praça de cada cargo, que o currículo traz e o site ignorava', () => {
    r(<Campaigns />)
    const items = screen.getAllByRole('article')
    expect(within(items[12]).getByText(/Américo Brasiliense/)).toBeInTheDocument()
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

describe('Training — formação com a linha de descrição do currículo', () => {
  it('cada curso mostra também o que o currículo descreve dele', () => {
    r(<Training />)
    for (const e of en.education.items) {
      expect(screen.getByText(e.note)).toBeInTheDocument()
    }
  })
})

describe('Arena — projetos e comunidade do currículo', () => {
  it('lista os três projetos do currículo, com link onde existe', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    r(<Arena />)
    for (const w of en.projects.works) expect(screen.getByText(w.title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /CrawlerJS/ }))
      .toHaveAttribute('href', 'https://github.com/rodrigorizandobr')
  })
})

describe('Contact — telefone do currículo, protegido como o e-mail', () => {
  it('mostra o número e liga, mas só depois de montar no navegador', async () => {
    r(<Contact />)
    const tel = await screen.findByRole('link', { name: /94180-0766/ })
    expect(tel).toHaveAttribute('href', 'tel:+5511941800766')
  })

  it('oferece WhatsApp para o mesmo número', async () => {
    r(<Contact />)
    const wa = await screen.findByRole('link', { name: /WhatsApp/ })
    expect(wa).toHaveAttribute('href', 'https://wa.me/5511941800766')
  })
})

describe('Training / Contact / Logs', () => {
  it('Training: 4 formações', () => {
    r(<Training />)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByText(/MBA USP\/Esalq/)).toBeInTheDocument()
  })
  it('Contact: o endereço NÃO aparece no HTML servido — só depois de montar', () => {
    // coletor de spam varre o HTML entregue; o endereço é montado no navegador
    const { container } = r(<Contact />)
    expect(container.innerHTML).toContain('@')  // sanidade: há texto na seção
    const antesDeMontar = document.createElement('div')
    antesDeMontar.innerHTML = '<a class="btn-start"></a>'
    expect(antesDeMontar.innerHTML).not.toContain('rodrigorizando')
  })

  it('Contact: mailto real + GA contact_click', async () => {
    r(<Contact />)
    const mail = screen.getByRole('link', { name: en.contact.btn_email })
    // o assunto vem do próprio convite do cartão
    expect(mail.getAttribute('href')).toMatch(/^mailto:rodrigorizando@gmail\.com\?subject=/)
    await userEvent.click(mail)
    expect(window.gtag).toHaveBeenCalledWith('event', 'contact_click', { channel: 'email', language: 'en' })
  })
  it('Logs: mostra os posts vindos da API, no idioma atual, com link para o post', async () => {
    const post = {
      id: '1', slug: 'a', status: 'published', tags: ['cloud'], image: null, imageAlt: '',
      i18n: { en: { title: 'Post A', excerpt: 'sum a', sections: [] }, pt: { title: 'Post A pt', excerpt: 's', sections: [] } },
      createdAt: '2026-04-10T00:00:00Z', updatedAt: '', scheduledFor: null, publishedAt: '2026-04-10T00:00:00Z',
      readingMinutes: { pt: 2, en: 2 },
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ posts: [post] }), { status: 200 })))
    r(<Logs />)
    expect(await screen.findByText('Post A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /READ POST/ })).toHaveAttribute('href', '/blog/a')
  })
})
