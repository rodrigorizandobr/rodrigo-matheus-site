import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { gaEvt } from '../analytics/ga'
import { Reveal } from '../components/ui/Reveal'
import { SectionHead } from '../components/ui/SectionHead'
import { IconArrowUpRight, IconBack } from '../components/ui/Icons'
import { blogApi } from '../blog/api'
import { PostArticle } from '../blog/PostArticle'
import { bodyFor, coverUrl, type Lang, type Post } from '../blog/types'

const dateOf = (post: Post) => (post.publishedAt || post.createdAt || '').slice(0, 10)

/**
 * Posts: lista em /blog/ e post em /blog/<slug>.
 *
 * O corpo do post são SEÇÕES (título + parágrafos), não HTML — por isso não há
 * `dangerouslySetInnerHTML` nem sanitização aqui: texto gerado por IA entra no
 * DOM como texto, e nenhuma marcação que o modelo inventar é executável.
 */
export function BlogPage({ slug }: { slug: string | null }) {
  const { t, lang } = useI18n()
  const s = t.sections.blog
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [post, setPost] = useState<Post | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    if (slug) {
      setPost(undefined)
      blogApi.get(slug).then((p) => alive && setPost(p)).catch(() => alive && setPost(null))
    } else {
      blogApi.list().then((p) => alive && setPosts(p)).catch(() => alive && setPosts([]))
    }
    return () => { alive = false }
  }, [slug])

  const body = post ? bodyFor(post, lang as Lang) : null

  useEffect(() => {
    const base = 'Rodrigo Matheus'
    document.title = body?.title ? `${body.title} — ${base}` : `Blog — ${base}`
  }, [body?.title])

  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-12 md:py-16 min-h-[70svh]">
      {slug && post === null && (
        <div className="panel hud-frame p-10 text-center max-w-xl mx-auto">
          <div className="font-display font-bold tracking-[.2em] text-heading">{s.notFound}</div>
          <a href="/blog/" className="cta inline-flex items-center gap-2 mt-6 font-display font-semibold text-[12px] uppercase tracking-wider !py-3 !px-5">
            <IconBack width={12} height={12} />{s.all}
          </a>
        </div>
      )}

      {post && body && (
        <div className="max-w-[72ch] mx-auto">
          <a href="/blog/" onClick={() => gaEvt('nav_click', { target: '/blog' })}
             className="chip !h-8 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider mb-7 md:mb-8">
            <IconBack width={11} height={11} />{s.all}
          </a>
          <PostArticle post={post} lang={lang as Lang} minutes={post.readingMinutes?.[lang as Lang] ?? 1} />
        </div>
      )}

      {!slug && (
        <>
          <SectionHead title={s.title} sub={s.sub} aside={
            <a href="/" className="chip !h-9 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider">
              <IconBack width={11} height={11} />HOME
            </a>} />
          {posts?.length === 0 && (
            <p className="panel p-8 text-center text-muted text-[14px]">{s.empty}</p>
          )}
          {posts && posts.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((p, i) => {
                const c = bodyFor(p, lang as Lang)
                const cover = coverUrl(p.image)
                return (
                  <Reveal as="li" key={p.slug} delay={i * 0.05} className="list-none">
                    <article className="panel h-full flex flex-col overflow-hidden">
                      {cover && (
                        <a href={`/blog/${p.slug}`} className="block">
                          <img src={cover} alt={p.image?.alt || p.imageAlt} loading="lazy" decoding="async"
                               className="w-full aspect-[16/9] object-cover border-b border-line" />
                        </a>
                      )}
                      <div className="p-5 flex flex-col gap-3 flex-1">
                        <div className="flex items-center justify-between font-mono text-[10.5px] text-muted">
                          <span>{dateOf(p)}</span><span>{p.readingMinutes?.[lang as Lang] ?? 1} {s.min}</span>
                        </div>
                        <h2 className="font-display font-semibold text-heading text-[16px] leading-snug">
                          <a href={`/blog/${p.slug}`} className="text-heading hover:text-red transition-colors">{c.title}</a>
                        </h2>
                        <p className="text-[13px] leading-relaxed text-text line-clamp-3">{c.excerpt}</p>
                        <div className="flex flex-wrap gap-1.5 mt-auto">
                          {p.tags.map((tag) => <span key={tag} className="font-mono text-[10px] px-1.5 py-0.5 border border-line text-muted">#{tag}</span>)}
                        </div>
                        <a href={`/blog/${p.slug}`} onClick={() => gaEvt('nav_click', { target: `/blog/${p.slug}` })}
                           className="cta !py-2 !px-3 inline-flex items-center justify-between font-display font-semibold text-[11px] uppercase tracking-wider">
                          {s.read}<IconArrowUpRight width={12} height={12} />
                        </a>
                      </div>
                    </article>
                  </Reveal>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
