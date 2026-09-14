/**
 * Três páginas, sem dependência de router. `/blog/<slug>` é canônico; `/blog/#slug`
 * (links antigos) ainda resolve. `/admin` é o painel — a proteção de verdade está no
 * backend (allowlist + ID token), aqui só decide qual tela montar.
 */
export type Route = { page: 'home' | 'blog' | 'admin'; slug: string | null }

export function routeFor(pathname: string, hash: string): Route {
  const path = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
  if (path === '/admin' || path.startsWith('/admin/')) return { page: 'admin', slug: null }
  const m = path.match(/^\/blog(?:\/([^/]+))?$/)
  if (!m) return { page: 'home', slug: null }
  const slug = m[1] ?? (hash.startsWith('#') && hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null)
  return { page: 'blog', slug }
}

export const currentRoute = () => routeFor(window.location.pathname, window.location.hash)
