import type { Post } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { IconArrowUpRight } from '../../components/ui/Icons'

const dateOf = (post: Post) => (post.publishedAt || post.scheduledFor || post.createdAt || '').slice(0, 10)
const titleOf = (post: Post) => post.i18n?.pt?.title || post.i18n?.en?.title || ''

/**
 * Lista de posts do painel. No celular a linha vira duas: miniatura + texto em
 * cima, botões embaixo ocupando a largura — botão de 11px espremido ao lado de
 * um título truncado é impossível de acertar com o dedo.
 */
export function PostList({ posts, onPreview, onEdit }: {
  posts: Post[]
  onPreview: (post: Post) => void
  onEdit: (post: Post) => void
}) {
  return (
    <ul className="grid gap-3">
      {posts.map((post) => {
        const cover = coverUrl(post.image)
        const title = titleOf(post)
        return (
          <li key={post.id} className="panel p-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {cover
                ? <img src={cover} alt="" className="w-20 h-14 sm:w-24 sm:h-16 object-cover border border-line shrink-0" />
                : <div className="w-20 h-14 sm:w-24 sm:h-16 border border-line shrink-0 grid place-items-center font-mono text-[9px] text-muted">sem capa</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge" data-status={post.status}>{post.status}</span>
                  <span className="font-mono text-[11px] text-muted">{dateOf(post)}</span>
                  {post.generation && <span className="font-mono text-[10px] text-muted">IA</span>}
                </div>
                <p className="font-display font-semibold text-heading text-[14px] mt-1 line-clamp-2 break-words">
                  {title || <span className="text-muted font-normal">(sem título)</span>}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto">
              <button type="button" onClick={() => onPreview(post)}
                      className="chip !h-9 flex-1 sm:flex-none justify-center font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                visualizar
              </button>
              {post.status === 'published' && (
                <a href={`/blog/${post.slug}`} target="_blank" rel="noopener"
                   className="chip !h-9 flex-1 sm:flex-none justify-center gap-1.5 font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                  no site <IconArrowUpRight width={10} height={10} />
                </a>
              )}
              <button type="button" onClick={() => onEdit(post)}
                      className="cta !py-2 !px-4 flex-1 sm:flex-none justify-center font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                editar
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
