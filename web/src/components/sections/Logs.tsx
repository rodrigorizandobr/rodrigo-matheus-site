import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useSectionView } from '../../hooks/useSectionView'
import { gaEvt } from '../../analytics/ga'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { IconArrowUpRight } from '../ui/Icons'
import { blogApi } from '../../blog/api'
import { bodyFor, coverUrl, type Lang, type Post } from '../../blog/types'

/** Os três posts mais recentes na home. Mesma API da página /blog — não há mais posts.json. */
export function Logs() {
  const { t, lang } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'blog')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const s = t.sections.blog

  useEffect(() => {
    let alive = true
    blogApi.list()
      .then((all) => { if (alive) setPosts(all.slice(0, 3)) })
      .catch(() => { if (alive) setPosts([]) })
    return () => { alive = false }
  }, [])

  return (
    <div ref={ref}>
      <Section id="blog">
        <SectionHead title={s.title} sub={s.sub}
          aside={<a href="/blog/" onClick={() => gaEvt('nav_click', { target: '/blog' })}
                    className="cta !py-2.5 !px-3 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider">
                   {s.all}<IconArrowUpRight width={12} height={12} />
                 </a>} />
        {posts && posts.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-3">
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
                        <span>{(p.publishedAt || p.createdAt || '').slice(0, 10)}</span>
                        <span>{p.readingMinutes?.[lang as Lang] ?? 1} {s.min}</span>
                      </div>
                      <h3 className="font-display font-semibold text-heading text-[15px] leading-snug">{c.title}</h3>
                      <p className="text-[12.5px] leading-relaxed text-text line-clamp-3">{c.excerpt}</p>
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
      </Section>
    </div>
  )
}
