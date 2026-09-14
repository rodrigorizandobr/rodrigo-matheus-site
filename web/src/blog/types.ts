/** Forma do post, espelhando api/blog/store.py. Datas chegam como ISO-8601. */
export type Lang = 'pt' | 'en'
export type Section = { heading: string; paragraphs: string[] }
export type Body = { title: string; excerpt: string; sections: Section[] }
export type PostStatus = 'draft' | 'scheduled' | 'published'

export type CoverImage = {
  hash: string
  provider: 'gemini' | 'pixabay'
  credit: string
  sourceUrl: string
  alt: string
}

/** Fonte usada pela pesquisa, com o que a ABNT pede para citar. */
export type Reference = {
  url: string
  title: string
  site: string
  /** ISO-8601 de quando a página foi lida */
  accessedAt: string
}

export type Post = {
  id: string
  slug: string
  status: PostStatus
  tags: string[]
  i18n: Record<Lang, Body>
  image: CoverImage | null
  imageAlt: string
  /** só no painel */
  imagePrompt?: string
  topic?: string
  generation?: { model: string; generatedAt: string; topic: string } | null
  /** fontes da pesquisa — públicas: o leitor precisa ver de onde o texto saiu */
  references?: Reference[]
  /** posts antigos guardavam só as URLs */
  sources?: string[]
  createdAt: string
  updatedAt: string
  scheduledFor: string | null
  publishedAt: string | null
  readingMinutes?: Record<Lang, number>
}

/** O que o painel envia ao criar um post em branco: sem id, slug nem datas — o backend decide. */
export type NewPost = {
  slugBase: string
  tags: string[]
  i18n: Partial<Record<Lang, Body>>
  imageAlt?: string
  imagePrompt?: string
  topic?: string
}

/** Item da biblioteca de mídia. O arquivo vive no GCS; isto é o catálogo. */
export type MediaItem = {
  hash: string
  provider: 'upload' | 'gemini' | 'pixabay'
  alt: string
  credit: string
  sourceUrl: string
  prompt?: string
  width: number
  height: number
  bytes: number
  createdAt: string
}

/** Candidata do banco de imagens, antes de virar nossa. */
export type StockResult = {
  id: string
  thumb: string
  url: string
  credit: string
  sourceUrl: string
  width: number
  height: number
}

export type BlogConfig = {
  timezone: string
  auto_publish: boolean
  delay_days: number
  publish_hour: number
  generate_hour: number
  /** 0 = segunda … 6 = domingo */
  generate_weekdays: number[]
  /** pesquisa na web (Serper + leitura das páginas) ao escrever */
  research_enabled: boolean
  /** de onde vem o assunto na geração automática */
  auto_source: 'topics' | 'news'
  /** termos vigiados para virar post a partir de notícia */
  news_terms: string[]
  /** temas próprios, sorteados quando a origem é a pauta */
  topics: string[]
}

/** URL pública da capa — servida pela nossa API, nunca pelo banco de imagens de origem. */
export const coverUrl = (image: { hash: string } | null): string | null =>
  image ? `/api/blog/image/${image.hash}.jpg` : null

/** Corpo no idioma pedido, caindo para o outro se faltar — post nunca some por idioma. */
export const bodyFor = (post: Post, lang: Lang): Body =>
  post.i18n?.[lang] ?? post.i18n?.[lang === 'pt' ? 'en' : 'pt'] ?? { title: '', excerpt: '', sections: [] }
