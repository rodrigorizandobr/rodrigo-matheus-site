/** Two pages, no router dependency. `/blog/<slug>` is canonical; `/blog/#slug` (legacy links) still resolves. */
export type Route = { page: 'home' | 'blog'; slug: string | null }

export function routeFor(pathname: string, hash: string): Route {
  const path = pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
  const m = path.match(/^\/blog(?:\/([^/]+))?$/)
  if (!m) return { page: 'home', slug: null }
  const slug = m[1] ?? (hash.startsWith('#') && hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null)
  return { page: 'blog', slug }
}

export const currentRoute = () => routeFor(window.location.pathname, window.location.hash)
