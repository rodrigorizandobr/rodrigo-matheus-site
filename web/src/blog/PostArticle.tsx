import type { Lang, Post } from './types'
import { bodyFor, coverUrl } from './types'

/**
 * O post renderizado. Único renderizador do conteúdo: a página pública e a
 * prévia do painel usam este mesmo componente, senão "visualizar" mostraria algo
 * diferente do que o leitor vê — que é justamente o que a prévia existe para evitar.
 *
 * O corpo são seções de texto, nunca HTML: nada que o modelo escreva é executável.
 */
export function PostArticle({ post, lang, minutes }: { post: Post; lang: Lang; minutes: number }) {
  const body = bodyFor(post, lang)
  const cover = coverUrl(post.image)
  const date = (post.publishedAt || post.scheduledFor || post.createdAt || '').slice(0, 10)

  return (
    <article className="max-w-[72ch] mx-auto">
      {cover && (
        <figure className="mb-7 md:mb-8">
          <img src={cover} alt={post.image?.alt || post.imageAlt} loading="lazy" decoding="async"
               className="w-full aspect-[16/9] object-cover border border-line" />
          <figcaption className="font-mono text-[10.5px] text-muted mt-2">
            {post.image?.sourceUrl
              ? <a href={post.image.sourceUrl} rel="noopener nofollow" target="_blank" className="hover:text-red">{post.image.credit}</a>
              : post.image?.credit}
          </figcaption>
        </figure>
      )}

      <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
        <span>{date}</span><span aria-hidden="true">·</span><span>{minutes} min</span>
      </div>
      <h1 className="font-display font-semibold text-heading text-[26px] md:text-[40px] leading-[1.12] mt-3 text-balance">
        {body.title}
      </h1>
      <p className="text-[15px] md:text-[16px] leading-relaxed text-muted mt-4">{body.excerpt}</p>

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {post.tags.map((tag) => (
            <span key={tag} className="font-mono text-[10.5px] px-1.5 py-0.5 border border-line text-muted">#{tag}</span>
          ))}
        </div>
      )}

      <div className="panel p-5 sm:p-6 md:p-10 mt-7 md:mt-8 prose-log post-body">
        {body.sections.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h2 className="font-display font-semibold text-heading">{section.heading}</h2>
            )}
            {section.paragraphs.map((paragraph, j) => (
              <p key={j} className="text-[15px] leading-[1.75] text-text break-words">{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
