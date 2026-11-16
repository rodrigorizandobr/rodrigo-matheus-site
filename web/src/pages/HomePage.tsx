import { useEffect, useState } from 'react'
import { blogApi } from '../blog/api'
import type { Post } from '../blog/types'
import { CareerLine } from '../home/CareerLine'
import { HeroPost } from '../home/HeroPost'
import { PostStream } from '../home/PostStream'
import { Tools } from '../home/Tools'
import { useI18n } from '../i18n/useI18n'
import { homeRoute } from '../thread/routes'
import { Thread } from '../thread/Thread'

/** Quantos posts a lista da home mostra, além da manchete. O resto mora em /blog. */
const ROWS = 8

/**
 * A home (specs/002-fio-condutor): o blog é a capa, depois os utilitários, depois o currículo — e um
 * fio vermelho só, do cabeçalho ao fim. Com a API do blog fora do ar a página continua de pé: sem
 * manchete e sem lista, mas com utilitários e currículo.
 */
export function HomePage() {
  const { t } = useI18n()
  const [posts, setPosts] = useState<Post[] | null>(null)

  useEffect(() => {
    let alive = true
    blogApi.list().then((p) => { if (alive) setPosts(p) }).catch(() => { if (alive) setPosts([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => { document.title = t.meta.title }, [t])

  const [latest, ...rest] = posts ?? []
  return (
    <div className="fio-stage">
      <Thread route={homeRoute} />
      <HeroPost post={latest ?? null} loading={posts === null} />
      <PostStream posts={rest.slice(0, ROWS)} total={posts?.length ?? 0} />
      <Tools />
      <CareerLine />
    </div>
  )
}
