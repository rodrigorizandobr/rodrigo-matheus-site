/**
 * Cinco páginas, sem dependência de router. `/blog/<slug>` é canônico; `/blog/#slug`
 * (links antigos) ainda resolve. `/admin` é o painel (allowlist no backend);
 * `/vivendo-de-imoveis` e `/previdencia-privada` são simuladores (qualquer conta
 * autenticada, cada uma só vê o próprio plano) — aqui só decide qual tela montar,
 * a proteção de verdade está no backend.
 */
export type Route = { page: 'home' | 'blog' | 'admin' | 'planner' | 'pension'; slug: string | null }

export function routeFor(pathname: string, hash: string): Route {
  const path = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
  if (path === '/admin' || path.startsWith('/admin/')) return { page: 'admin', slug: null }
  if (path === '/vivendo-de-imoveis') return { page: 'planner', slug: null }
  if (path === '/previdencia-privada') return { page: 'pension', slug: null }
  const m = path.match(/^\/blog(?:\/([^/]+))?$/)
  if (!m) return { page: 'home', slug: null }
  const slug = m[1] ?? (hash.startsWith('#') && hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null)
  return { page: 'blog', slug }
}

export const currentRoute = () => routeFor(window.location.pathname, window.location.hash)
