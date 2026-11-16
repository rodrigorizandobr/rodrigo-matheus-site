import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../i18n/useI18n'
import { MILESTONES } from '../home/career'
import { HomePage } from './HomePage'

const post = (n: string, date: string, tags: string[], extra: Record<string, unknown> = {}) => ({
  id: n, slug: `post-${n}`, status: 'published', publishedAt: date, tags,
  readingMinutes: { pt: 2, en: 2 },
  image: { hash: `hash${n}`, alt: `capa ${n}`, credit: '', sourceUrl: '', width: 1376, height: 768 },
  i18n: {
    pt: { title: `Título ${n} em português`, excerpt: `Resumo ${n}.`, sections: [] },
    en: { title: `Title ${n} in English`, excerpt: `Summary ${n}.`, sections: [] },
  },
  ...extra,
})

const POSTS = [
  post('a', '2026-11-14T10:00:00Z', ['liderança']),
  post('b', '2026-11-12T10:00:00Z', ['inteligência artificial', 'segurança']),
  post('c', '2026-11-06T10:00:00Z', ['inteligencia-artificial'], { clip: { hash: 'v1' } }),
  post('d', '2026-10-27T10:00:00Z', ['Segurança', 'nvidia'], { image: null }),
]

const comPosts = (posts: unknown[] | Error) =>
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (posts instanceof Error) throw posts
    return { ok: true, status: 200, json: async () => ({ posts }) }
  }))

const r = () => render(<I18nProvider><HomePage /></I18nProvider>)
afterEach(() => vi.unstubAllGlobals())

describe('home — o blog é a capa do site', () => {
  it('o post mais recente vira a manchete, com link para a leitura', async () => {
    comPosts(POSTS)
    r()
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Title a in English')
    expect(within(h1).getByRole('link')).toHaveAttribute('href', '/blog/post-a')
    expect(screen.getByRole('img', { name: 'capa a' })).toHaveAttribute('src', '/api/blog/image/hasha.jpg')
  })

  it('o fim da manchete é o trecho que o fio sublinha', async () => {
    comPosts(POSTS)
    r()
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.querySelector('[data-fio="u"]')).toHaveTextContent('in English')
  })

  it('os outros posts entram na lista, do mais novo para o mais antigo, sem repetir a manchete', async () => {
    comPosts(POSTS)
    r()
    await screen.findByRole('heading', { level: 1 })
    const lista = screen.getByRole('list', { name: /posts/i })
    const titulos = within(lista).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Title b in English', 'Title c in English', 'Title d in English'])
    expect(within(lista).getAllByRole('link')[0]).toHaveAttribute('href', '/blog/post-b')
  })

  it('post com recorte avisa que tem vídeo; post sem capa sai só com texto', async () => {
    comPosts(POSTS)
    r()
    await screen.findByRole('heading', { level: 1 })
    const itens = within(screen.getByRole('list', { name: /posts/i })).getAllByRole('listitem')
    expect(itens[1]).toHaveTextContent(/video/i)
    expect(itens[0]).not.toHaveTextContent(/video/i)
    expect(itens[2].querySelector('img')).toBeNull()
  })

  it('em português a home fala português, inclusive a data', async () => {
    localStorage.setItem('lang', 'pt')
    comPosts(POSTS)
    r()
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Título a em português')
    expect(screen.getByRole('heading', { level: 2, name: 'Puxe um fio' })).toBeInTheDocument()
    expect(screen.getByText(/14 nov 2026/)).toBeInTheDocument()
  })

  it('sem posts (API fora do ar) a home continua de pé, com utilitários e currículo', async () => {
    comPosts(new Error('fora do ar'))
    r()
    expect(await screen.findByText(/No posts here yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Full résumé/ })).toBeInTheDocument()
  })
})

describe('puxe um fio — filtro por assunto', () => {
  it('os assuntos saem das tags que se repetem na lista', async () => {
    comPosts(POSTS)
    r()
    await screen.findByRole('heading', { level: 1 })
    const grupo = screen.getByRole('group', { name: /topics/i })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'inteligência artificial', 'segurança'])
    expect(within(grupo).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('escolher um assunto deixa o fio só nos posts dele; "todos" devolve', async () => {
    comPosts(POSTS)
    r()
    await screen.findByRole('heading', { level: 1 })
    const itens = () => within(screen.getByRole('list', { name: /posts/i })).getAllByRole('listitem').map((li) => li.getAttribute('data-on'))
    await userEvent.click(screen.getByRole('button', { name: 'segurança' }))
    expect(screen.getByRole('button', { name: 'segurança' })).toHaveAttribute('aria-pressed', 'true')
    expect(itens()).toEqual(['true', 'false', 'true'])
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(itens()).toEqual(['true', 'true', 'true'])
  })
})

describe('utilitários e currículo', () => {
  it('os dois simuladores têm cartão com link', async () => {
    comPosts(POSTS)
    r()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: /Living off real estate.*Simulate/s })).toHaveAttribute('href', '/vivendo-de-imoveis')
    expect(screen.getByRole('link', { name: /Private pension.*Simulate/s })).toHaveAttribute('href', '/previdencia-privada')
  })

  it('a linha da carreira tem todos os marcos, do estágio ao cargo de hoje', async () => {
    comPosts(POSTS)
    r()
    const linha = within(screen.getByRole('list', { name: /Career line/ })).getAllByRole('listitem')
    expect(linha).toHaveLength(MILESTONES.length)
    expect(linha[0]).toHaveTextContent('Ponto ED')
    expect(linha[linha.length - 1]).toHaveTextContent('Digio')
  })

  it('a mão não tem fio: ela marca o ponto da pinça, e é ali que o fio da página termina', async () => {
    comPosts(POSTS)
    r()
    const mao = screen.getByRole('img', { name: /android hand/i })
    expect(mao).toHaveAttribute('data-fio', 'hand')
    expect(mao.getAttribute('data-pinch')).toMatch(/^0\.\d+,0\.\d+$/)
    expect(mao.getAttribute('src')).toMatch(/mao-pinca/)
  })

  it('o currículo em PDF segue o idioma da página, e o completo tem página própria', async () => {
    comPosts(POSTS)
    r()
    expect(screen.getByRole('link', { name: /Download résumé/ })).toHaveAttribute('href', '/cv-en.pdf')
    expect(screen.getByRole('link', { name: /Full résumé/ })).toHaveAttribute('href', '/curriculo')
  })

  it('em português o PDF é o do autor', async () => {
    localStorage.setItem('lang', 'pt')
    comPosts(POSTS)
    r()
    expect(screen.getByRole('link', { name: /Baixar currículo/ })).toHaveAttribute('href', '/cv-pt-br.pdf')
  })
})
