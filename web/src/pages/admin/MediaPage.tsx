import { useEffect, useState } from 'react'
import type { MediaItem } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { ImageSources, SOURCE_LABELS, type MediaApi, type SourceTab } from './ImageSources'

type FullMediaApi = MediaApi & {
  update: (hash: string, patch: { alt?: string; credit?: string }) => Promise<MediaItem>
  remove: (hash: string) => Promise<unknown>
}

/** Aba Mídia: as mesmas quatro origens do seletor, mais editar legenda e apagar. */
export function MediaPage({ api }: { api: FullMediaApi }) {
  const [tab, setTab] = useState<SourceTab>('library')
  const [items, setItems] = useState<MediaItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<MediaItem | null>(null)

  useEffect(() => {
    api.list().then(setItems).catch((err) => setError((err as Error).message))
  }, [api])

  const arrived = (item: MediaItem) => {
    setItems((all) => [item, ...all.filter((i) => i.hash !== item.hash)])
    setTab('library')
  }

  return (
    <div className="grid gap-5">
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(SOURCE_LABELS) as SourceTab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                  className="toggle-chip !h-9 !px-3">{SOURCE_LABELS[t]}</button>
        ))}
      </div>

      {error && <p className="panel p-3 text-[13px] text-red" role="status">{error}</p>}

      <div className="panel p-4 md:p-5">
        {tab === 'library' ? (
          items.length === 0
            ? <p className="text-[13px] text-muted py-6 text-center">Biblioteca vazia — envie, crie com IA ou busque no banco de imagens.</p>
            : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <li key={item.hash} className="border border-line flex flex-col">
                    <img src={coverUrl(item)!} alt={item.alt} loading="lazy" className="w-full aspect-[16/9] object-cover" />
                    <div className="p-3 grid gap-2 flex-1">
                      <div className="font-mono text-[10px] text-muted flex flex-wrap gap-x-2">
                        <span>{item.provider}</span><span>{item.width}×{item.height}</span>
                        <span>{Math.round(item.bytes / 1024)} kB</span>
                      </div>
                      <p className="text-[12.5px] text-text line-clamp-2 break-words">{item.alt || <span className="text-muted">sem legenda</span>}</p>
                      {item.credit && <p className="font-mono text-[10px] text-muted truncate">{item.credit}</p>}
                      <div className="flex gap-2 mt-auto">
                        <button type="button" onClick={() => setEditing(item)}
                                className="chip !h-8 flex-1 justify-center font-display font-semibold text-[10.5px] uppercase tracking-wider">editar</button>
                        <button type="button" disabled={busy}
                                className="chip !h-8 flex-1 justify-center font-display font-semibold text-[10.5px] uppercase tracking-wider !text-red"
                                onClick={async () => {
                                  if (!confirm('Apagar esta imagem?')) return
                                  setBusy(true); setError('')
                                  try {
                                    await api.remove(item.hash)
                                    setItems((all) => all.filter((i) => i.hash !== item.hash))
                                  } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
                                }}>apagar</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
        ) : (
          <ImageSources tab={tab} api={api} items={items} busy={busy} setBusy={setBusy}
                        onError={setError} onArrived={arrived} />
        )}
      </div>

      {editing && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Editar imagem">
          <div className="preview-bar">
            <span className="font-display font-semibold text-[11px] uppercase tracking-wider text-heading">editar imagem</span>
            <button type="button" onClick={() => setEditing(null)}
                    className="cta !py-2 !px-4 font-display font-semibold text-[11px] uppercase tracking-wider">fechar</button>
          </div>
          <div className="preview-body">
            <div className="w-[min(46rem,92vw)] mx-auto py-8 grid gap-4">
              <img src={coverUrl(editing)!} alt={editing.alt} className="w-full aspect-[16/9] object-cover border border-line" />
              <div>
                <label className="field-label" htmlFor="med-alt">Legenda</label>
                <input id="med-alt" className="field" value={editing.alt}
                       onChange={(e) => setEditing({ ...editing, alt: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="med-credit">Crédito</label>
                <input id="med-credit" className="field" value={editing.credit}
                       onChange={(e) => setEditing({ ...editing, credit: e.target.value })} />
              </div>
              <button type="button" disabled={busy}
                      className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider"
                      onClick={async () => {
                        setBusy(true); setError('')
                        try {
                          const saved = await api.update(editing.hash, { alt: editing.alt, credit: editing.credit })
                          setItems((all) => all.map((i) => (i.hash === saved.hash ? saved : i)))
                          setEditing(null)
                        } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
                      }}>salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
