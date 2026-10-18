/**
 * Cada tela do painel tem URL: refresh volta ao mesmo lugar, e voltar/avançar do
 * navegador anda entre as telas. O Hosting serve o index.html em qualquer caminho
 * (`**` no firebase.json), então `/admin/editar/<id>` abre direto.
 */
export type AdminTab = 'posts' | 'media' | 'config'
export type AdminView = { tab: AdminTab; editId: string | null; previewId: string | null }

const TAB_PATH: Record<AdminTab, string> = { posts: '', media: 'midia', config: 'configuracao' }

export function parseAdminPath(pathname: string): AdminView {
  const partes = pathname.replace(/\/+$/, '').split('/').slice(2) // tira '' e 'admin'
  const [primeiro = '', id] = partes
  const decoded = id ? decodeURIComponent(id) : null
  if (primeiro === 'editar' && decoded) return { tab: 'posts', editId: decoded, previewId: null }
  if (primeiro === 'visualizar' && decoded) return { tab: 'posts', editId: null, previewId: decoded }
  if (primeiro === 'midia' && partes.length === 1) return { tab: 'media', editId: null, previewId: null }
  if (primeiro === 'configuracao' && partes.length === 1) return { tab: 'config', editId: null, previewId: null }
  return { tab: 'posts', editId: null, previewId: null }
}

export function adminPath(view: AdminView): string {
  if (view.previewId) return previewPath(view.previewId)
  if (view.editId) return `/admin/editar/${encodeURIComponent(view.editId)}`
  const tab = TAB_PATH[view.tab]
  return tab ? `/admin/${tab}` : '/admin'
}

export const previewPath = (id: string): string => `/admin/visualizar/${encodeURIComponent(id)}`

/**
 * A prévia abre em outra aba, que não enxerga o estado deste painel. O texto ainda não
 * salvo vai pelo localStorage; sem ele (janela privada, armazenamento bloqueado) a aba
 * nova mostra a última versão salva.
 */
const PREVIEW_KEY = (id: string) => `admin-preview:${id}`
const PREVIEW_TTL_MS = 60 * 60 * 1000

export function stashPreview<T extends { id: string }>(post: T): void {
  try { localStorage.setItem(PREVIEW_KEY(post.id), JSON.stringify({ at: Date.now(), post })) } catch { /* sem armazenamento */ }
}

export function readStashedPreview<T>(id: string): T | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY(id))
    if (!raw) return null
    const { at, post } = JSON.parse(raw) as { at: number; post: T }
    return Date.now() - at < PREVIEW_TTL_MS ? post : null
  } catch {
    return null
  }
}

/**
 * O servidor manda no que muda sozinho (recorte de vídeo, capa, status); a cópia guardada só
 * vale pelo texto ainda não salvo. Usar a cópia inteira escondia o vídeo que ficou pronto
 * depois de ela ser guardada, por até 1 h.
 */
export function resolvePreview<T extends { i18n: unknown; tags: unknown }>(fresh: T | undefined, stashed: T | null): T | null {
  if (!fresh) return stashed
  if (!stashed) return fresh
  return { ...fresh, i18n: stashed.i18n, tags: stashed.tags }
}
