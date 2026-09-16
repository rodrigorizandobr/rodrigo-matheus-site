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
export function PostList({ posts, onPreview, onEdit, onTogglePublish, onToggleLinkedin, busyId = null }: {
  posts: Post[]
  onPreview: (post: Post) => void
  onEdit: (post: Post) => void
  /** publicar (rascunho e agendado) ou tirar do ar (publicado), sem abrir o editor */
  onTogglePublish: (post: Post) => void
  /** habilitar ou não este post para o compartilhamento no LinkedIn */
  onToggleLinkedin: (post: Post) => void
  busyId?: string | null
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

                  {/* Só post publicado entra na fila do LinkedIn. Campo ausente = habilitado. */}
                  {post.status === 'published' && (
                    post.linkedinPostedAt
                      ? <span className="badge" title={`compartilhado em ${post.linkedinPostedAt.slice(0, 10)}`}>
                          no LinkedIn · {post.linkedinPostedAt.slice(0, 10)}
                        </span>
                      : <button type="button" disabled={busyId === post.id}
                                onClick={() => onToggleLinkedin(post)}
                                aria-pressed={post.linkedinEnabled !== false}
                                aria-label="LinkedIn"
                                title={post.linkedinEnabled !== false ? 'na fila do LinkedIn — clique para tirar' : 'fora da fila do LinkedIn — clique para incluir'}
                                className="toggle-chip !h-[1.4rem] !min-w-0 !px-2 !text-[10px]">
                          LinkedIn
                        </button>
                  )}
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
              <button type="button" onClick={() => onTogglePublish(post)} disabled={busyId === post.id}
                      className={`${post.status === 'published' ? 'chip' : 'cta cta-primary'} !h-9 !py-2 !px-4 flex-1 sm:flex-none justify-center font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap`}>
                {post.status === 'published' ? 'despublicar' : 'publicar'}
              </button>
              <button type="button" onClick={() => onEdit(post)} disabled={busyId === post.id}
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
