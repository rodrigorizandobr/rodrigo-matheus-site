import { useEffect, useMemo, useState } from 'react'
import { PostArticle } from '../../blog/PostArticle'
import { bodyFor, type Lang, type Post } from '../../blog/types'

/** Mesma conta do backend (api/blog/model.py) — o rascunho não tem o valor do servidor. */
function readingMinutes(post: Post, lang: Lang): number {
  const body = bodyFor(post, lang)
  const words = body.sections.reduce(
    (total, section) => total + section.heading.split(/\s+/).filter(Boolean).length
      + section.paragraphs.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0),
    0,
  )
  return Math.max(1, Math.round(words / 200))
}

/**
 * Prévia do post dentro do painel, com o MESMO componente da página pública.
 *
 * Por que não abrir `/blog/<slug>` numa aba: o site público não serve rascunho —
 * e não deve mesmo. Abrir aqui, com o post que o painel já tem em mãos, permite
 * ver antes de publicar sem criar nenhuma porta para conteúdo não publicado.
 */
export function PostPreview({ post, onClose }: { post: Post; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>('pt')
  const minutes = useMemo(() => post.readingMinutes?.[lang] ?? readingMinutes(post, lang), [post, lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose])

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Prévia do post">
      <div className="preview-bar">
        <div className="flex items-center gap-2 min-w-0">
          <span className="badge shrink-0" data-status={post.status}>{post.status}</span>
          {post.status !== 'published' && (
            <span className="font-mono text-[11px] text-muted truncate">
              {post.status === 'scheduled' ? 'agendado — ainda não está no ar' : 'rascunho — ainda não está no ar'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1">
            {(['pt', 'en'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                      className="toggle-chip">{l.toUpperCase()}</button>
            ))}
          </div>
          <button type="button" onClick={onClose}
                  className="cta !py-2 !px-4 font-display font-semibold text-[11px] uppercase tracking-wider">fechar</button>
        </div>
      </div>
      <div className="preview-body">
        <div className="w-[min(var(--max),92vw)] mx-auto py-8 md:py-12">
          <PostArticle post={post} lang={lang} minutes={minutes} />
        </div>
      </div>
    </div>
  )
}
