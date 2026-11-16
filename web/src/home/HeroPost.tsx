import { gaEvt } from '../analytics/ga'
import { bodyFor, type Lang, type Post } from '../blog/types'
import { homeCover } from './cover'
import { useI18n } from '../i18n/useI18n'
import { shortDate } from './format'
import { LINKEDIN } from './links'
import { splitTail } from './tail'

/** A capa do site: o post mais recente em manchete. O fio sublinha o fim do título e contorna a imagem. */
export function HeroPost({ post, loading }: { post: Post | null; loading: boolean }) {
  const { t, lang } = useI18n()
  const h = t.home

  if (!post) {
    return (
      <section className="fio-hero" aria-busy={loading}>
        <div className="fio-wrap">
          <div className="fio-in fio-head">
            {loading ? <p className="fio-mono">{h.loading}</p> : <h1 className="fio-d">{h.empty}</h1>}
          </div>
        </div>
      </section>
    )
  }

  const body = bodyFor(post, lang as Lang)
  const [head, tail] = splitTail(body.title)
  const href = `/blog/${post.slug}`
  const cover = homeCover(post)
  const minutes = post.readingMinutes?.[lang as Lang] ?? 1
  const read = () => gaEvt('home_read_latest', { slug: post.slug })

  return (
    <section className="fio-hero">
      <div className="fio-wrap">
        <div className="fio-in fio-head">
          <p className="fio-mono">{h.latest} · {shortDate(post.publishedAt || post.createdAt || '', lang)} · {minutes} {h.minRead}</p>
          <h1 className="fio-d">
            <a href={href} onClick={read}>{head}{head && ' '}<span data-fio="u" className="fio-nowrap">{tail}</span></a>
          </h1>
        </div>
        <div className="fio-in fio-rest">
          {body.excerpt && <p className="fio-lede">{body.excerpt}</p>}
          <div className="fio-acts">
            <a className="fio-btn" href={href} onClick={read}>{h.read} →</a>
            <a className="fio-lnk" href={LINKEDIN} target="_blank" rel="noopener noreferrer">{h.follow}</a>
          </div>
        </div>
        {cover && post.image && (
          <figure className="fio-cover" data-fio="cover">
            <img src={cover} alt={post.image.alt || ''} width={post.image.width ?? 1376} height={post.image.height ?? 768} fetchPriority="high" />
          </figure>
        )}
      </div>
    </section>
  )
}
