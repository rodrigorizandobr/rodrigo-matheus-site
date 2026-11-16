import { useEffect, useMemo, useState } from 'react'
import { bodyFor, clipUrl, type Lang, type Post } from '../blog/types'
import { homeCover } from './cover'
import { useI18n } from '../i18n/useI18n'
import { nudgeThread } from '../thread/Thread'
import { shortDate } from './format'
import { hasTopic, topics } from './topics'

/**
 * "Puxe um fio": a lista de posts presa ao fio por alfinetes. Escolher um assunto não esconde os
 * outros posts — eles encolhem, e o fio passa a prender só os do assunto (`data-on`, lido pela rota).
 */
export function PostStream({ posts, total }: { posts: Post[]; total: number }) {
  const { t, lang } = useI18n()
  const h = t.home
  const [topic, setTopic] = useState<string | null>(null)
  const chips = useMemo(() => topics(posts), [posts])

  useEffect(() => { nudgeThread() }, [topic, posts])

  return (
    <section id="blog" className="fio-sec" data-fio="blog">
      <div className="fio-wrap">
        <div className="fio-in">
          <h2 className="fio-d">{h.pull}</h2>
          <p className="fio-lead">{h.pullLead}</p>
          {chips.length > 0 && (
            <div className="fio-chips" role="group" aria-label={h.topics}>
              <button type="button" className="fio-chip" aria-pressed={topic === null} onClick={() => setTopic(null)}>{h.allTopics}</button>
              {chips.map((c) => (
                <button key={c.key} type="button" className="fio-chip" aria-pressed={topic === c.key} onClick={() => setTopic(c.key)}>{c.label}</button>
              ))}
            </div>
          )}
          {posts.length > 0 && (
            <ul className="fio-rows" aria-label="Posts">
              {posts.map((post) => {
                const body = bodyFor(post, lang as Lang)
                const on = topic === null || hasTopic(post, topic)
                const cover = homeCover(post)
                return (
                  <li key={post.id} className={`fio-row${on ? '' : ' is-off'}`} data-fio="row" data-on={on}>
                    <a href={`/blog/${post.slug}`}>
                      <span className="fio-mono fio-when">
                        {shortDate(post.publishedAt || post.createdAt || '', lang)}
                        {clipUrl(post.clip) && <> · <b>{h.video}</b></>}
                      </span>
                      <div>
                        <h3>{body.title}</h3>
                        {body.excerpt && body.excerpt !== body.title && <p>{body.excerpt}</p>}
                      </div>
                      {cover && <span className="fio-thumb"><img src={cover} alt="" loading="lazy" width={440} height={248} /></span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
          {total > 0 && <a className="fio-lnk fio-more" href="/blog/">{h.allPosts.replace('{n}', String(total))} →</a>}
        </div>
      </div>
    </section>
  )
}
