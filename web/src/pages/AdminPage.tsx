import { useCallback, useEffect, useMemo, useState } from 'react'
import { blogApi, ApiError } from '../blog/api'
import type { BlogConfig, Post } from '../blog/types'
import { PostEditor } from './admin/PostEditor'
import { ConfigPanel } from './admin/ConfigPanel'
import { PostList } from './admin/PostList'
import { PostPreview } from './admin/PostPreview'
import { MediaPage } from './admin/MediaPage'
import { ImagePicker } from './admin/ImagePicker'
import { idToken, signInWithGoogle, signOutAdmin, watchUser } from '../blog/firebase'

type Tab = 'posts' | 'media' | 'config'
type Session = { email: string } | null

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
  const [previewing, setPreviewing] = useState<Post | null>(null)
  const [pickingCover, setPickingCover] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [research, setResearch] = useState(true)
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
          {(['posts', 'media', 'config'] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); setEditing(null) }} aria-pressed={tab === t}
                    className="toggle-chip !h-9 !px-4 uppercase font-display font-semibold tracking-wider">
              {t === 'posts' ? 'posts' : t === 'media' ? 'mídia' : 'configuração'}
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

      {tab === 'media' && <MediaPage api={api.media} />}

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
          onPreview={() => setPreviewing(editing)}
          onSave={() => run('save', async () => {
            update(await api.update(editing.id, { i18n: editing.i18n, tags: editing.tags }))
          }, 'Post salvo.')}
          onRevise={(instruction) => run('revise', async () => { update(await api.revise(editing.id, instruction)) }, 'Post reescrito pela IA.')}
          onCover={(prompt) => run('cover', async () => { update(await api.cover(editing.id, prompt)) }, 'Capa nova gerada.')}
          onPickCover={() => setPickingCover(true)}
          onClearCover={() => run('cover', async () => { update(await api.setCover(editing.id, null)) }, 'Capa removida.')}
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
                     placeholder="Tema (vazio = a IA escolhe, conforme a configuração)" />
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-[12px] text-muted">
                <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />
                pesquisar na web antes de escrever
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy !== null}
                      className="cta cta-primary !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider whitespace-nowrap"
                      onClick={() => run('generate', async () => {
                        const post = await api.generate(topic, research)
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

          <PostList posts={posts} onPreview={setPreviewing} onEdit={setEditing} busyId={togglingId}
                    onTogglePublish={(post) => {
                      setTogglingId(post.id)
                      void run('publish', async () => {
                        const saved = post.status === 'published' ? await api.unpublish(post.id) : await api.publish(post.id)
                        setPosts((all) => all.map((p) => (p.id === saved.id ? saved : p)))
                      }, post.status === 'published' ? 'Post fora do ar.' : 'Post no ar.')
                        .finally(() => setTogglingId(null))
                    }} />
        </>
      )}
      {previewing && <PostPreview post={previewing} onClose={() => setPreviewing(null)} />}
      {pickingCover && editing && (
        <ImagePicker api={api.media} onClose={() => setPickingCover(false)}
                     onPick={(item) => {
                       setPickingCover(false)
                       void run('cover', async () => { update(await api.setCover(editing.id, item.hash)) }, 'Capa escolhida.')
                     }} />
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
