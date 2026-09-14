import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { useI18n } from '../i18n/useI18n'
import { gaEvt } from '../analytics/ga'
import { Reveal } from '../components/ui/Reveal'
import { SectionHead } from '../components/ui/SectionHead'
import { IconArrowUpRight, IconBack } from '../components/ui/Icons'

type Post = { slug: string; date: string; tags: string[]; i18n: Record<string, { title: string; summary: string; body: string }> }

const readingMin = (html: string) => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200))

/** LOGS as a page: list at /blog/, post at /blog/<slug>. Same posts.json the v2 blog read. */
export function BlogPage({ slug }: { slug: string | null }) {
  const { t, lang } = useI18n()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const s = t.sections.blog

  useEffect(() => {
    let alive = true
    fetch('/blog/posts.json').then((r) => (r.ok ? r.json() : [])).then((p: Post[]) => {
      if (alive) setPosts(Array.isArray(p) ? [...p].sort((a, b) => b.date.localeCompare(a.date)) : [])
    }).catch(() => { if (alive) setPosts([]) })
    return () => { alive = false }
  }, [])

  const post = useMemo(() => (slug && posts ? posts.find((p) => p.slug === slug) ?? null : null), [slug, posts])
  const copy = post ? (post.i18n[lang] ?? post.i18n.en) : null

  useEffect(() => {
    const base = 'Rodrigo Matheus'
    document.title = copy ? `${copy.title} — ${base}` : `Blog — ${base}`
  }, [copy])

  const html = useMemo(() => (copy ? DOMPurify.sanitize(copy.body, { USE_PROFILES: { html: true } }) : ''), [copy])

  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-12 md:py-16 min-h-[70svh]">
      {slug && posts && !post && (
        <div className="panel hud-frame p-10 text-center max-w-xl mx-auto">
          <div className="font-display font-bold tracking-[.2em] text-heading">LOG NOT FOUND</div>
          <a href="/blog/" className="cta inline-flex items-center gap-2 mt-6 font-display font-semibold text-[12px] uppercase tracking-wider !py-3 !px-5"><IconBack width={12} height={12} />{s.all}</a>
        </div>
      )}

      {copy && post && (
        <article className="max-w-[72ch] mx-auto">
          <a href="/blog/" onClick={() => gaEvt('nav_click', { target: '/blog' })} className="chip !h-8 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider mb-8"><IconBack width={11} height={11} />{s.all}</a>
          <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
            <span>{post.date}</span><span aria-hidden="true">·</span><span>{readingMin(copy.body)} {s.min}</span>
          </div>
          <h1 className="font-display font-semibold text-heading text-[28px] md:text-[40px] leading-[1.1] mt-3 text-balance">{copy.title}</h1>
          <p className="text-[16px] leading-relaxed text-muted mt-4">{copy.summary}</p>
          <div className="flex flex-wrap gap-1.5 mt-4">{post.tags.map((tag) => <span key={tag} className="font-mono text-[10.5px] px-1.5 py-0.5 border border-line text-muted">#{tag}</span>)}</div>
          <div className="panel p-6 md:p-10 mt-8 prose-log" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      )}

      {!slug && (
        <>
          <SectionHead tag={s.tag} title="Blog" sub={s.sub} aside={<a href="/" className="chip !h-9 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider"><IconBack width={11} height={11} />HOME</a>} />
          {posts && (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((p, i) => {
                const c = p.i18n[lang] ?? p.i18n.en
                return (
                  <Reveal as="li" key={p.slug} delay={i * 0.05} className="list-none">
                    <article className="panel h-full p-5 flex flex-col gap-3">
                      <div className="flex items-center justify-between font-mono text-[10.5px] text-muted"><span>{p.date}</span><span>{readingMin(c.body)} {s.min}</span></div>
                      <h2 className="font-display font-semibold text-heading text-[16px] leading-snug"><a href={`/blog/${p.slug}`} className="text-heading hover:text-red transition-colors">{c.title}</a></h2>
                      <p className="text-[13px] leading-relaxed text-text line-clamp-3">{c.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mt-auto">{p.tags.map((tag) => <span key={tag} className="font-mono text-[10px] px-1.5 py-0.5 border border-line text-muted">#{tag}</span>)}</div>
                      <a href={`/blog/${p.slug}`} onClick={() => gaEvt('nav_click', { target: `/blog/${p.slug}` })} className="cta !py-2 !px-3 inline-flex items-center justify-between font-display font-semibold text-[11px] uppercase tracking-wider">{s.read}<IconArrowUpRight width={12} height={12} /></a>
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
