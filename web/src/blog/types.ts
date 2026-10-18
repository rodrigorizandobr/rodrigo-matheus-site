/** Forma do post, espelhando api/blog/store.py. Datas chegam como ISO-8601. */
export type Lang = 'pt' | 'en'
export type Section = { heading: string; paragraphs: string[] }
export type Body = { title: string; excerpt: string; sections: Section[] }
export type PostStatus = 'draft' | 'scheduled' | 'published'

export type CoverImage = {
  hash: string
  /** o site público não recebe isto — só o painel, pela biblioteca de mídia */
  provider?: 'gemini' | 'pixabay'
  /** vazio na ilustração da casa; preenchido no que vem de banco de imagens */
  credit: string
  sourceUrl: string
  alt: string
  width?: number
  height?: number
}

/**
 * Recorte de vídeo do YouTube, feito no Mac do autor (api/clip_worker.py). O site público só
 * recebe o pronto, e sem `status`; o painel recebe tudo, inclusive pendente e falho.
 */
export type Clip = {
  status?: 'pending' | 'ready' | 'failed'
  hash?: string
  sourceUrl?: string
  title?: string
  channel?: string
  /** segundos no vídeo original */
  start?: number
  end?: number
  /** vários trechos do original montados num vídeo só, em ordem de vídeo: [início, fim] em segundos */
  parts?: number[][]
  width?: number
  height?: number
  reason?: string
  attempts?: number
  lastError?: string
  /** vídeos que não serviram, em ordem — o Mac passa para o próximo sozinho */
  tried?: { url: string; title?: string; channel?: string; reason: string; kind: 'rede' | 'conteudo' }[]
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
  clip?: Clip | null
  /** só no painel */
  imagePrompt?: string
  topic?: string
  generation?: {
    model: string; generatedAt: string; topic: string
    /** frases que a conferência achou sem fonte no material e que a reescrita não resolveu */
    unsupportedLeft?: string[] | null
  } | null
  /** fontes da pesquisa — públicas: o leitor precisa ver de onde o texto saiu */
  references?: Reference[]
  /** posts antigos guardavam só as URLs */
  sources?: string[]
  /** habilitado para ir ao LinkedIn — ausente conta como SIM */
  linkedinEnabled?: boolean
  /** quando foi ao LinkedIn; `null` = ainda na fila */
  linkedinPostedAt?: string | null
  linkedinUrn?: string
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
  /** 0 = segunda … 6 = domingo — mesma agenda usada para escrever E para compartilhar no LinkedIn */
  generate_weekdays: number[]
  /** busca notícias (Serper, Brasil) e lê as páginas antes de escrever */
  research_enabled: boolean
  /** assuntos vigiados; o robô passa por todos em rodízio antes de repetir */
  news_terms: string[]
  /** temas do modo "reflexão" (sem notícia); o robô passa por todos em rodízio antes de repetir */
  reflection_topics: string[]
  /** expressões que entregam texto de IA; cada uma vale como começo de palavra, sem acento */
  banned_phrases: string[]
  /** compartilhar os posts no LinkedIn automaticamente, na mesma agenda de `generate_weekdays`/`generate_hour` */
  linkedin_enabled: boolean
}

/** Resumo da conexão com o LinkedIn. Nunca carrega o token. */
export type LinkedInStatus = {
  connected: boolean
  hasApp: boolean
  /** Client ID do app cadastrado (o secret nunca sai do servidor) */
  clientId?: string
  /** URL de retorno que precisa estar registrada no app do LinkedIn */
  redirectUri?: string
  personUrn?: string
  daysLeft?: number
  expiresAt?: string
  /** a régua consegue mandar e-mail? (SMTP configurado no servidor) */
  alertsOn?: boolean
  /** quando o último aviso da régua saiu */
  lastNoticeAt?: string
}

/** URL pública da capa — servida pela nossa API, nunca pelo banco de imagens de origem. */
export const coverUrl = (image: { hash: string } | null): string | null =>
  image ? `/api/blog/image/${image.hash}.jpg` : null

/** URL do recorte pronto (o público vem sem `status`, o painel vem com) — ou null. */
export const clipUrl = (clip: Clip | null | undefined): string | null =>
  clip?.hash && (clip.status === undefined || clip.status === 'ready') ? `/api/blog/video/${clip.hash}.mp4` : null

/** Link do vídeo original já no segundo em que o trecho começa. */
export const clipSourceAt = (clip: Clip): string =>
  clip.sourceUrl ? `${clip.sourceUrl}${clip.sourceUrl.includes('?') ? '&' : '?'}t=${clip.start ?? 0}s` : ''

/** Corpo no idioma pedido, caindo para o outro se faltar — post nunca some por idioma. */
export const bodyFor = (post: Post, lang: Lang): Body =>
  post.i18n?.[lang] ?? post.i18n?.[lang === 'pt' ? 'en' : 'pt'] ?? { title: '', excerpt: '', sections: [] }
