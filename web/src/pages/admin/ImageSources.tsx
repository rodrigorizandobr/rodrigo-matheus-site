import { useRef, useState } from 'react'
import type { MediaItem, StockResult } from '../../blog/types'
import { coverUrl } from '../../blog/types'

export type MediaApi = {
  list: () => Promise<MediaItem[]>
  upload: (file: File, alt?: string) => Promise<MediaItem>
  generate: (prompt: string, alt?: string) => Promise<MediaItem>
  searchStock: (q: string) => Promise<StockResult[]>
  importStock: (r: StockResult, alt?: string) => Promise<MediaItem>
}

export type SourceTab = 'library' | 'upload' | 'ai' | 'stock'

export const SOURCE_LABELS: Record<SourceTab, string> = {
  library: 'biblioteca',
  upload: 'enviar',
  ai: 'criar com IA',
  stock: 'banco de imagens',
}

/**
 * As quatro origens de imagem, num componente só — a biblioteca (`/admin`, aba
 * Mídia) e o seletor de capa do post oferecem exatamente as mesmas, e duplicar
 * isso garantiria que um dia uma origem existisse só de um lado.
 *
 * Nada aqui fala com a rede direto: recebe `api` de fora, o que também torna o
 * componente testável sem tocar em `fetch`.
 */
export function ImageSources({ tab, api, items, onArrived, onError, busy, setBusy }: {
  tab: SourceTab
  api: MediaApi
  items: MediaItem[]
  onArrived: (item: MediaItem) => void
  onError: (message: string) => void
  busy: boolean
  setBusy: (busy: boolean) => void
}) {
  const [alt, setAlt] = useState('')
  const [prompt, setPrompt] = useState('')
  const [query, setQuery] = useState('')
  const [stock, setStock] = useState<StockResult[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (fn: () => Promise<MediaItem>) => {
    setBusy(true)
    try {
      onArrived(await fn())
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (tab === 'library') {
    if (items.length === 0) {
      return <p className="text-[13px] text-muted py-6 text-center">Biblioteca vazia — envie, crie com IA ou busque no banco de imagens.</p>
    }
    return (
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <li key={item.hash}>
            <button type="button" onClick={() => onArrived(item)} disabled={busy}
                    className="block w-full text-left border border-line hover:border-red transition-colors">
              <img src={coverUrl(item)!} alt={item.alt} loading="lazy"
                   className="w-full aspect-[16/9] object-cover" />
              <span className="block font-mono text-[10px] text-muted p-1.5 truncate">
                {item.provider} · {item.width}×{item.height}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  if (tab === 'upload') {
    return (
      <div className="grid gap-3 max-w-md">
        <div>
          <label className="field-label" htmlFor="up-alt">Legenda (descreve a imagem para quem não a vê)</label>
          <input id="up-alt" className="field" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="field" disabled={busy}
               aria-label="arquivo de imagem"
               onChange={(e) => {
                 const file = e.target.files?.[0]
                 if (file) void run(() => api.upload(file, alt)).then(() => { if (fileRef.current) fileRef.current.value = '' })
               }} />
        <p className="text-[11.5px] text-muted">Até 12 MB. O arquivo é convertido para JPEG e passa a ser nosso.</p>
      </div>
    )
  }

  if (tab === 'ai') {
    return (
      <div className="grid gap-3 max-w-md">
        <div>
          <label className="field-label" htmlFor="ai-prompt">Descreva a cena (em inglês funciona melhor)</label>
          <textarea id="ai-prompt" className="field !min-h-[6rem]" value={prompt} disabled={busy}
                    placeholder="a robotic hand holding a glowing red server blade"
                    onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="ai-alt">Legenda</label>
          <input id="ai-alt" className="field" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <button type="button" disabled={busy || !prompt.trim()} onClick={() => void run(() => api.generate(prompt, alt))}
                className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
          {busy ? 'criando…' : 'criar imagem'}
        </button>
        <p className="text-[11.5px] text-muted">A IA usa sempre a direção de arte do site: laboratório branco, vermelho como único acento.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2 max-w-md">
        <input className="field" value={query} placeholder="o que procurar" aria-label="buscar no banco de imagens"
               onChange={(e) => setQuery(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <button type="button" disabled={busy || !query.trim()}
                className="cta !py-2 !px-4 font-display font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap"
                onClick={async () => {
                  setBusy(true)
                  try { setStock(await api.searchStock(query)) } catch (err) { onError((err as Error).message) } finally { setBusy(false) }
                }}>
          buscar
        </button>
      </div>
      {stock?.length === 0 && <p className="text-[13px] text-muted">Nada encontrado — tente outro termo, em inglês.</p>}
      {stock && stock.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stock.map((result) => (
            <li key={result.id}>
              <button type="button" disabled={busy} onClick={() => void run(() => api.importStock(result, alt))}
                      className="block w-full text-left border border-line hover:border-red transition-colors">
                <img src={result.thumb} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover" />
                <span className="block font-mono text-[10px] text-muted p-1.5 truncate">{result.credit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
