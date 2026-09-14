import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { gaEvt } from '../../analytics/ga'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { IconArrowUpRight } from '../ui/Icons'

type Post = { slug: string; date: string; tags: string[]; i18n: Record<string, { title: string; summary: string; body: string }> }

/** LOGS: posts.json (the same file the legacy /blog page reads), in the current language. */
export function Logs() {
  const { t, lang } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'blog')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const s = t.sections.blog

  useEffect(() => {
    let alive = true
    fetch('/blog/posts.json').then((r) => (r.ok ? r.json() : [])).then((p) => { if (alive) setPosts(Array.isArray(p) ? p : []) }).catch(() => { if (alive) setPosts([]) })
    return () => { alive = false }
  }, [])

  const readingMin = (html: string) => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200))

  return (
    <div ref={ref}>
    <Section id="blog">
      <SectionHead tag={s.tag} title="Blog" sub={s.sub}
        aside={<a href="/blog/" onClick={() => gaEvt('nav_click', { target: '/blog' })} className="cta !py-2.5 !px-3 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider">{s.all}<IconArrowUpRight width={12} height={12} /></a>} />
      {posts && posts.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-3">
          {posts.map((p, i) => {
            const c = p.i18n[lang] ?? p.i18n.en
            return (
              <Reveal as="li" key={p.slug} delay={i * 0.05} className="list-none">
                <article className="panel h-full p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-muted">
                    <span>{p.date}</span><span>{readingMin(c.body)} {s.min}</span>
                  </div>
                  <h3 className="font-display font-semibold text-heading text-[15px] leading-snug">{c.title}</h3>
                  <p className="text-[12.5px] leading-relaxed text-text line-clamp-3">{c.summary}</p>
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {p.tags.map((tag) => <span key={tag} className="font-mono text-[10px] px-1.5 py-0.5 border border-line text-muted">#{tag}</span>)}
                  </div>
                  <a href={`/blog/${p.slug}`} onClick={() => gaEvt('nav_click', { target: `/blog/${p.slug}` })}
                     className="cta !py-2 !px-3 inline-flex items-center justify-between font-display font-semibold text-[11px] uppercase tracking-wider">{s.read}<IconArrowUpRight width={12} height={12} /></a>
                </article>
              </Reveal>
            )
          })}
        </ul>
      )}
    </Section>
    </div>
  )
}
