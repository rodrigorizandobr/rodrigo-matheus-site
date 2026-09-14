import { useCallback, useEffect, useMemo, useState } from 'react'
import { blogApi, ApiError } from '../blog/api'
import type { BlogConfig, Post } from '../blog/types'
import { coverUrl } from '../blog/types'
import { PostEditor } from './admin/PostEditor'
import { ConfigPanel } from './admin/ConfigPanel'
import { idToken, signInWithGoogle, signOutAdmin, watchUser } from '../blog/firebase'

type Tab = 'posts' | 'config'
type Session = { email: string } | null

const dateOf = (post: Post) => (post.publishedAt || post.scheduledFor || post.createdAt || '').slice(0, 10)

/**
 * Painel do blog em /admin.
 *
 * A tela só esconde botões; quem autoriza de verdade é o backend, que confere o
 * ID token contra a allowlist. Por isso aqui não há checagem de e-mail: entrar
 * com outra conta Google mostra o painel vazio e toda ação volta 401 — e é assim
 * que tem de ser, porque validação no cliente não vale nada.
 */
export function AdminPage() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [config, setConfig] = useState<BlogConfig | null>(null)
  const [editing, setEditing] = useState<Post | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
  const [topic, setTopic] = useState('')

  const api = useMemo(() => blogApi.admin(idToken), [])

  useEffect(() => {
    document.title = 'Painel do blog — Rodrigo Matheus'
    return watchUser((user) => setSession(user ? { email: user.email ?? '' } : null))
  }, [])

  const run = useCallback(async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key); setMessage(null)
    try {
      await fn()
      if (ok) setMessage({ kind: 'ok', text: ok })
    } catch (err) {
      const text = err instanceof ApiError && err.status === 401
        ? 'Sessão expirada ou conta sem permissão. Entre novamente.'
        : (err as Error).message
      setMessage({ kind: 'erro', text })
    } finally {
      setBusy(null)
    }
  }, [])

  const reload = useCallback(async () => {
    const [list, cfg] = await Promise.all([api.list(), api.config()])
    setPosts(list); setConfig(cfg)
  }, [api])

  useEffect(() => {
    if (session) void run('load', reload)
  }, [session, run, reload])

  if (session === undefined) {
    return <Shell><p className="text-muted text-[13px]">Verificando sessão…</p></Shell>
  }

  if (session === null) {
    return (
      <Shell>
        <div className="panel hud-frame p-8 md:p-10 max-w-md mx-auto text-center grid gap-5">
          <div>
            <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">PAINEL DO BLOG</div>
            <p className="text-[13px] text-muted mt-2">Acesso restrito ao dono do site.</p>
          </div>
          <button type="button" onClick={() => run('login', async () => { await signInWithGoogle() })}
                  disabled={busy === 'login'}
                  className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
            {busy === 'login' ? 'abrindo…' : 'entrar com Google'}
          </button>
          {message && <p className="text-[12px] text-red">{message.text}</p>}
        </div>
      </Shell>
    )
  }

  const update = (post: Post) => {
    setEditing(post)
    setPosts((all) => all.map((p) => (p.id === post.id ? post : p)))
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div className="flex gap-1">
          {(['posts', 'config'] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); setEditing(null) }} aria-pressed={tab === t}
                    className="toggle-chip !h-9 !px-4 uppercase font-display font-semibold tracking-wider">
              {t === 'posts' ? 'posts' : 'configuração'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted">{session.email}</span>
          <button type="button" onClick={() => signOutAdmin()} className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">sair</button>
        </div>
      </div>

      {message && (
        <p className={`panel p-3 mb-5 text-[13px] ${message.kind === 'erro' ? 'text-red' : 'text-heading'}`} role="status">
          {message.text}
        </p>
      )}

      {tab === 'config' && config && (
        <ConfigPanel config={config} busy={busy === 'config'}
                     onSave={(patch) => run('config', async () => { setConfig(await api.saveConfig(patch)) }, 'Configuração salva.')} />
      )}

      {tab === 'posts' && editing && (
        <PostEditor
          post={editing}
          busy={busy}
          onChange={update}
          onClose={() => setEditing(null)}
          onSave={() => run('save', async () => {
            update(await api.update(editing.id, { i18n: editing.i18n, tags: editing.tags }))
          }, 'Post salvo.')}
          onRevise={(instruction) => run('revise', async () => { update(await api.revise(editing.id, instruction)) }, 'Post reescrito pela IA.')}
          onCover={(prompt) => run('cover', async () => { update(await api.cover(editing.id, prompt)) }, 'Capa nova gerada.')}
          onPublish={() => run('publish', async () => { update(await api.publish(editing.id)) }, 'No ar.')}
          onUnpublish={() => run('publish', async () => { update(await api.unpublish(editing.id)) }, 'Fora do ar.')}
          onSchedule={(when) => run('schedule', async () => { update(await api.schedule(editing.id, when)) }, 'Agendado.')}
          onDelete={() => {
            if (!confirm('Apagar este post para sempre?')) return
            void run('delete', async () => {
              await api.remove(editing.id)
              setPosts((all) => all.filter((p) => p.id !== editing.id))
              setEditing(null)
            }, 'Post apagado.')
          }}
        />
      )}

      {tab === 'posts' && !editing && (
        <>
          <div className="panel p-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end mb-6">
            <div>
              <label className="field-label" htmlFor="novo-tema">Escrever um post novo</label>
              <input id="novo-tema" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}
                     placeholder="Tema (deixe vazio para a IA sortear da pauta)" />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy !== null}
                      className="cta cta-primary !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider whitespace-nowrap"
                      onClick={() => run('generate', async () => {
                        const post = await api.generate(topic)
                        setPosts((all) => [post, ...all]); setEditing(post); setTopic('')
                      }, 'Post escrito pela IA.')}>
                {busy === 'generate' ? 'escrevendo…' : 'gerar com IA'}
              </button>
              <button type="button" disabled={busy !== null}
                      className="cta !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider whitespace-nowrap"
                      onClick={() => run('create', async () => {
                        const post = await api.create({
                          slugBase: 'rascunho', tags: [],
                          i18n: { pt: { title: '', excerpt: '', sections: [{ heading: '', paragraphs: [''] }] },
                                  en: { title: '', excerpt: '', sections: [{ heading: '', paragraphs: [''] }] } },
                        })
                        setPosts((all) => [post, ...all]); setEditing(post)
                      })}>
                em branco
              </button>
            </div>
          </div>

          {busy === 'load' && <p className="text-muted text-[13px]">Carregando…</p>}
          {busy !== 'load' && posts.length === 0 && <p className="panel p-8 text-center text-muted text-[14px]">Nenhum post ainda.</p>}

          <ul className="grid gap-3">
            {posts.map((post) => {
              const cover = coverUrl(post.image)
              return (
                <li key={post.id} className="panel p-3 flex items-center gap-4">
                  {cover
                    ? <img src={cover} alt="" className="w-24 h-16 object-cover border border-line shrink-0" />
                    : <div className="w-24 h-16 border border-line shrink-0 grid place-items-center font-mono text-[10px] text-muted">sem capa</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge" data-status={post.status}>{post.status}</span>
                      <span className="font-mono text-[11px] text-muted">{dateOf(post)}</span>
                      {post.generation && <span className="font-mono text-[10px] text-muted">IA</span>}
                    </div>
                    <p className="font-display font-semibold text-heading text-[14px] mt-1 truncate">
                      {post.i18n?.pt?.title || post.i18n?.en?.title || '(sem título)'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {post.status === 'published' && (
                      <a href={`/blog/${post.slug}`} target="_blank" rel="noopener"
                         className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">ver</a>
                    )}
                    <button type="button" onClick={() => setEditing(post)}
                            className="cta !py-2 !px-3 font-display font-semibold text-[11px] uppercase tracking-wider">editar</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="section relative z-10 w-[min(var(--max),94vw)] mx-auto py-10 md:py-14 min-h-[70svh]">
      {children}
    </div>
  )
}
