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

export type BlogConfig = {
  timezone: string
  auto_publish: boolean
  delay_days: number
  publish_hour: number
  generate_hour: number
  /** 0 = segunda … 6 = domingo */
  generate_weekdays: number[]
  topics: string[]
}

/** URL pública da capa — servida pela nossa API, nunca pelo banco de imagens de origem. */
export const coverUrl = (image: CoverImage | null): string | null =>
  image ? `/api/blog/image/${image.hash}.jpg` : null

/** Corpo no idioma pedido, caindo para o outro se faltar — post nunca some por idioma. */
export const bodyFor = (post: Post, lang: Lang): Body =>
  post.i18n?.[lang] ?? post.i18n?.[lang === 'pt' ? 'en' : 'pt'] ?? { title: '', excerpt: '', sections: [] }
