/**
 * Bancada de layout do painel — SÓ desenvolvimento (`npm run dev` → /dev-admin.html).
 *
 * O painel real exige login com Google, o que torna impossível conferir o layout em
 * telas estreitas durante o desenvolvimento. Aqui os mesmos componentes são montados
 * com dados de exemplo. Não entra no build: o Vite só empacota o index.html.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles/tokens.css'
import { PostList } from '../src/pages/admin/PostList'
import { PostEditor } from '../src/pages/admin/PostEditor'
import { ConfigPanel } from '../src/pages/admin/ConfigPanel'
import { LinkedInPanel } from '../src/pages/admin/LinkedInPanel'
import { PostPreview } from '../src/pages/admin/PostPreview'
import { MediaPage } from '../src/pages/admin/MediaPage'
import type { BlogConfig, MediaItem, Post } from '../src/blog/types'

const midia = (n: number): MediaItem[] =>
  Array.from({ length: n }, (_, i) => ({
    hash: String(i).repeat(64).slice(0, 64),
    provider: (['upload', 'gemini', 'pixabay'] as const)[i % 3],
    alt: `Legenda de exemplo da imagem ${i + 1}, comprida o suficiente para truncar`,
    credit: 'Fulano de Tal / Pixabay', sourceUrl: 'https://pixabay.com/x', width: 1600, height: 900,
    bytes: 180_000, createdAt: '2026-09-14T12:00:00Z',
  }))

const mediaApi = {
  list: async () => midia(5),
  upload: async () => midia(1)[0],
  generate: async () => midia(1)[0],
  searchStock: async () => [],
  importStock: async () => midia(1)[0],
  update: async (_h: string, patch: { alt?: string }) => ({ ...midia(1)[0], ...patch }),
  remove: async () => ({ ok: true }),
}

const secoes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    heading: `Uma frase com conteúdo que serve de título para a seção ${i + 1}`,
    paragraphs: [
      'Parágrafo razoavelmente longo para medir a largura da coluna de texto e ver se alguma coisa estoura a tela em 390 pixels de largura, que é o caso do celular.',
      'Segundo parágrafo, mais curto.',
    ],
  }))

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1', slug: 'um-post-de-exemplo-com-slug-comprido-abc12345', status: 'scheduled',
  tags: ['ia aplicada', 'engenharia de software', 'arquitetura', 'produtividade'],
  image: { hash: 'f'.repeat(64), provider: 'gemini', credit: 'Gerada com IA (Gemini)', sourceUrl: '', alt: 'capa' },
  imageAlt: 'capa',
  i18n: {
    pt: { title: 'Como combinar BMad, Spec Kit e Super Powers destrói o caos na programação com IA', excerpt: 'Escrever código com IA sem estrutura gera dívida técnica rápido.', sections: secoes(4) },
    en: { title: 'How combining BMad, Spec Kit and Super Powers destroys chaos', excerpt: 'Writing code with AI without structure generates technical debt.', sections: secoes(4) },
  },
  generation: { model: 'gemini-3.5-flash-lite', generatedAt: '2026-09-14T12:00:00Z', topic: 't' },
  createdAt: '2026-09-14T12:00:00Z', updatedAt: '2026-09-14T12:00:00Z',
  scheduledFor: '2026-09-16T11:00:00Z', publishedAt: null, ...over,
})

const config: BlogConfig = {
  timezone: 'America/Sao_Paulo', auto_publish: false, delay_days: 2, publish_hour: 8,
  generate_hour: 6, generate_weekdays: [0, 3],
  research_enabled: true,
  news_terms: ['inteligência artificial', 'segurança da informação', 'infraestrutura em nuvem'],
}

function Bench() {
  const [atual, setAtual] = useState(post())
  const [preview, setPreview] = useState<Post | null>(null)
  const nada = () => {}
  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-8 grid gap-10">
      <h1 className="font-display font-bold text-heading text-[13px] tracking-[.2em]">BANCADA — LISTA</h1>
      <PostList posts={[post(), post({ id: 'p2', status: 'published', image: null }), post({ id: 'p3', status: 'draft' })]}
                onPreview={setPreview} onEdit={nada} onTogglePublish={nada} onToggleLinkedin={nada} />
      <h1 className="font-display font-bold text-heading text-[13px] tracking-[.2em]">BANCADA — EDITOR</h1>
      <PostEditor post={atual} busy={null} onChange={setAtual} onSave={nada} onRevise={nada} onCover={nada}
                  onPublish={nada} onUnpublish={nada} onSchedule={nada} onDelete={nada} onClose={nada}
                  onPreview={() => setPreview(atual)} onPickCover={nada} onClearCover={nada} onToggleLinkedin={nada} />
      <h1 className="font-display font-bold text-heading text-[13px] tracking-[.2em]">BANCADA — MÍDIA</h1>
      <MediaPage api={mediaApi} />
      <h1 className="font-display font-bold text-heading text-[13px] tracking-[.2em]">BANCADA — CONFIG</h1>
      <ConfigPanel config={config} busy={false} onSave={nada} />
      <LinkedInPanel config={config} busy={false} onSave={nada} onMessage={nada}
                     status={{ connected: true, hasApp: true, daysLeft: 7, personUrn: 'urn:li:person:bancada', alertsOn: false }}
                     onRefresh={nada} onConnect={nada}
                     api={{
                       status: async () => ({ connected: true, hasApp: true, daysLeft: 7, personUrn: 'urn:li:person:bancada' }),
                       connect: async () => '#', disconnect: async () => ({}),
                       saveApp: async () => ({ connected: false, hasApp: true }), shareNow: async () => null,
                       testAlert: async () => ({ sent: false, configured: false, reason: 'bancada: nada é enviado' }),
                     }} />
      {preview && <PostPreview post={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Bench /></StrictMode>)
