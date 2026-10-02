import { useEffect, useRef, useState } from 'react'
import type { Post } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { formatDay, statusLabel } from '../../blog/editing'
import { IconArrowUpRight } from '../../components/ui/Icons'

const dateOf = (post: Post) => formatDay(post.publishedAt || post.scheduledFor || post.createdAt)
const titleOf = (post: Post) => post.i18n?.pt?.title || post.i18n?.en?.title || ''

const BTN = 'font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap'
const ITEM = 'w-full text-left px-3 py-2.5 text-[12px] font-display font-semibold uppercase tracking-wider hover:bg-line/40 focus-visible:bg-line/40 disabled:opacity-50 flex items-center justify-between gap-3'

/**
 * Ações raras ficam num menu: publicar/despublicar, visualizar e editar são o
 * dia a dia e ficam à vista; LinkedIn avulso, link do site e exclusão não
 * precisam disputar a linha com elas. Fecha com Escape ou clique fora.
 */
function RowMenu({ post, disabled, onShareLinkedin, onDelete }: {
  post: Post
  disabled: boolean
  onShareLinkedin: (post: Post) => void
  onDelete: (post: Post) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  const pick = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div ref={box} className="relative">
      <button type="button" aria-label="mais ações" aria-haspopup="menu" aria-expanded={open} disabled={disabled}
              onClick={() => setOpen((o) => !o)} className="chip !h-9 !px-3 justify-center text-[16px] leading-none">
        ⋯
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 top-full mt-1 z-20 min-w-[15rem] py-1 shadow-lg">
          {post.status === 'published' && (
            <a role="menuitem" href={`/blog/${post.slug}`} target="_blank" rel="noopener" className={ITEM} onClick={() => setOpen(false)}>
              ver no site <IconArrowUpRight width={10} height={10} />
            </a>
          )}
          <button type="button" role="menuitem" className={ITEM} onClick={pick(() => onShareLinkedin(post))}>
            {post.linkedinPostedAt ? 'publicar de novo no LinkedIn' : 'publicar no LinkedIn'}
          </button>
          <button type="button" role="menuitem" className={`${ITEM} !text-red border-t border-line`} onClick={pick(() => onDelete(post))}>
            excluir
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Lista de posts do painel. No celular a linha vira duas: miniatura + texto em
 * cima, botões embaixo ocupando a largura — botão de 11px espremido ao lado de
 * um título truncado é impossível de acertar com o dedo.
 */
export function PostList({ posts, onPreview, onEdit, onTogglePublish, onToggleLinkedin, onShareLinkedin, onDelete, busyId = null }: {
  posts: Post[]
  onPreview: (post: Post) => void
  onEdit: (post: Post) => void
  /** publicar (rascunho e agendado) ou tirar do ar (publicado), sem abrir o editor */
  onTogglePublish: (post: Post) => void
  /** habilitar ou não este post para o compartilhamento no LinkedIn */
  onToggleLinkedin: (post: Post) => void
  /** manda ESTE post ao LinkedIn agora, fora da fila */
  onShareLinkedin: (post: Post) => void
  /** exclui o post (quem chama confirma) */
  onDelete: (post: Post) => void
  busyId?: string | null
}) {
  return (
    <ul className="grid gap-3">
      {posts.map((post) => {
        const cover = coverUrl(post.image)
        const title = titleOf(post)
        const busy = busyId === post.id
        return (
          <li key={post.id} className="panel p-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {cover
                ? <img src={cover} alt="" className="w-20 h-14 sm:w-24 sm:h-16 object-cover border border-line shrink-0" />
                : <div className="w-20 h-14 sm:w-24 sm:h-16 border border-line shrink-0 grid place-items-center font-mono text-[9px] text-muted">sem capa</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge" data-status={post.status}>{statusLabel(post.status)}</span>
                  <span className="font-mono text-[11px] text-muted">{dateOf(post)}</span>
                  {post.generation && <span className="font-mono text-[10px] text-muted">IA</span>}

                  {/* Uma marca só de LinkedIn: já foi (com o dia) ou está na fila (alternável). Só post no ar entra na fila; campo ausente = habilitado. */}
                  {post.linkedinPostedAt
                    ? <span className="badge">no LinkedIn · {formatDay(post.linkedinPostedAt)}</span>
                    : post.status === 'published' && (
                      <button type="button" disabled={busy}
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

            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <button type="button" onClick={() => onPreview(post)} className={`chip !h-9 flex-1 sm:flex-none justify-center ${BTN}`}>
                visualizar
              </button>
              <button type="button" onClick={() => onTogglePublish(post)} disabled={busy}
                      className={`${post.status === 'published' ? 'chip' : 'cta cta-primary'} !h-9 !py-2 !px-4 flex-1 sm:flex-none justify-center ${BTN}`}>
                {post.status === 'published' ? 'despublicar' : 'publicar'}
              </button>
              <button type="button" onClick={() => onEdit(post)} disabled={busy}
                      className={`cta !py-2 !px-4 flex-1 sm:flex-none justify-center ${BTN}`}>
                editar
              </button>
              <RowMenu post={post} disabled={busy} onShareLinkedin={onShareLinkedin} onDelete={onDelete} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
