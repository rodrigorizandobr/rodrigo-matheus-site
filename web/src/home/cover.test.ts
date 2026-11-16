import { describe, expect, it } from 'vitest'
import type { Post } from '../blog/types'
import { homeCover } from './cover'

const base = {
  id: '1', slug: 's', status: 'published',
  i18n: { pt: { title: 'Título do post', excerpt: '', sections: [] }, en: { title: 'Post title', excerpt: '', sections: [] } },
} as unknown as Post

describe('capa que a home mostra', () => {
  it('capa da casa aparece', () => {
    const post = { ...base, image: { hash: 'abc', alt: 'Maquete com fio vermelho', credit: '', sourceUrl: '' } } as Post
    expect(homeCover(post)).toBe('/api/blog/image/abc.jpg')
  })

  it('post sem capa não tem imagem', () => {
    expect(homeCover({ ...base, image: null } as Post)).toBeNull()
  })

  it('quadro de vídeo de terceiros não entra na home: destoa da direção de arte', () => {
    // quando o recorte fica pronto e o post não tem capa, o quadro do vídeo vira a capa, com o TÍTULO como descrição
    const post = { ...base, clip: { hash: 'v1' }, image: { hash: 'yt', alt: 'Título do post', credit: '', sourceUrl: '' } } as Post
    expect(homeCover(post)).toBeNull()
  })

  it('post com vídeo E capa da casa mostra a capa', () => {
    const post = { ...base, clip: { hash: 'v1' }, image: { hash: 'abc', alt: 'Carro preso à parede por um ventilador vermelho', credit: '', sourceUrl: '' } } as Post
    expect(homeCover(post)).toBe('/api/blog/image/abc.jpg')
  })
})
