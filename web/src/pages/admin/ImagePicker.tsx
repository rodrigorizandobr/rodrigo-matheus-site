import { useEffect, useState } from 'react'
import type { MediaItem } from '../../blog/types'
import { ImageSources, SOURCE_LABELS, type MediaApi, type SourceTab } from './ImageSources'

/** Seletor de capa do post: as quatro origens numa camada por cima do editor. */
export function ImagePicker({ api, onPick, onClose }: {
  api: MediaApi
  onPick: (item: MediaItem) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<SourceTab>('library')
  const [items, setItems] = useState<MediaItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.list().then(setItems).catch((err) => setError((err as Error).message))
  }, [api])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Escolher imagem">
      <div className="preview-bar">
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(SOURCE_LABELS) as SourceTab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                    className="toggle-chip !px-3">{SOURCE_LABELS[t]}</button>
          ))}
        </div>
        <button type="button" onClick={onClose}
                className="cta !py-2 !px-4 font-display font-semibold text-[11px] uppercase tracking-wider">fechar</button>
      </div>
      <div className="preview-body">
        <div className="w-[min(var(--max),92vw)] mx-auto py-6">
          {error && <p className="panel p-3 mb-4 text-[13px] text-red" role="status">{error}</p>}
          <ImageSources tab={tab} api={api} items={items} busy={busy} setBusy={setBusy}
                        onError={setError}
                        onArrived={(item) => { setItems((all) => [item, ...all.filter((i) => i.hash !== item.hash)]); onPick(item) }} />
        </div>
      </div>
    </div>
  )
}
