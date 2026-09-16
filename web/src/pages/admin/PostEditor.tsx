import { useState } from 'react'
import type { Lang, Post } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { parseTags, sectionsToText, textToSections } from '../../blog/editing'

type Props = {
  post: Post
  busy: string | null
  onChange: (post: Post) => void
  onSave: () => void
  onRevise: (instruction: string) => void
  onCover: (prompt: string) => void
  onPublish: () => void
  onUnpublish: () => void
  onSchedule: (when: Date) => void
  onDelete: () => void
  onClose: () => void
  onPreview: () => void
  onPickCover: () => void
  onClearCover: () => void
  onToggleLinkedin: () => void
}

/**
 * Editor do post. O corpo é UM campo de texto por idioma (`##` abre seção), e não
 * uma caixa por seção: com 4 seções em 2 línguas eram 8 caixas para mexer. O que
 * se grava continua sendo estrutura — ver blog/editing.ts.
 *
 * `onBlur` (e não `onChange`) para converter: reconstruir as seções a cada tecla
 * remontaria o textarea e jogaria o cursor para o fim.
 */

/** Data/hora para o input `datetime-local`, que trabalha em horário LOCAL do navegador. */
const toLocalInput = (iso: string | null): string => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 864e5)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PostEditor(p: Props) {
  const [lang, setLang] = useState<Lang>('pt')
  const [instruction, setInstruction] = useState('')
  const [coverPrompt, setCoverPrompt] = useState(p.post.imagePrompt ?? '')
  const [when, setWhen] = useState(() => toLocalInput(p.post.scheduledFor))

  const body = p.post.i18n?.[lang] ?? { title: '', excerpt: '', sections: [] }
  const setBody = (next: typeof body) => p.onChange({ ...p.post, i18n: { ...p.post.i18n, [lang]: next } })
  const disabled = p.busy !== null

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] items-start">
      <div className="panel p-5 md:p-7 grid gap-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1">
            {(['pt', 'en'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className="toggle-chip">{l.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={p.onPreview}
                    className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">visualizar</button>
            <button type="button" onClick={p.onClose}
                    className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">voltar à lista</button>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="ed-title">Título ({lang})</label>
          <input id="ed-title" className="field" value={body.title} disabled={disabled}
                 onChange={(e) => setBody({ ...body, title: e.target.value })} />
        </div>

        <div>
          <label className="field-label" htmlFor="ed-excerpt">Resumo ({lang})</label>
          <textarea id="ed-excerpt" className="field !min-h-[4.5rem]" value={body.excerpt} disabled={disabled}
                    onChange={(e) => setBody({ ...body, excerpt: e.target.value })} />
        </div>

        <div>
          <label className="field-label" htmlFor="ed-body">Conteúdo ({lang})</label>
          <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
            Um campo só. Comece uma linha com <code className="font-mono">##</code> para abrir uma seção;
            deixe uma linha em branco entre parágrafos.
          </p>
          <textarea id="ed-body" className="field !min-h-[24rem] leading-[1.7]" disabled={disabled}
                    key={`${p.post.id}-${lang}`}
                    defaultValue={sectionsToText(body.sections)}
                    onBlur={(e) => setBody({ ...body, sections: textToSections(e.target.value) })} />
        </div>

        <div>
          <label className="field-label" htmlFor="ed-tags">Tags (separadas por vírgula, até 6)</label>
          <input id="ed-tags" className="field" defaultValue={p.post.tags.join(', ')} disabled={disabled}
                 onBlur={(e) => p.onChange({ ...p.post, tags: parseTags(e.target.value) })} />
        </div>

        <button type="button" onClick={p.onSave} disabled={disabled}
                className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
          {p.busy === 'save' ? 'salvando…' : 'salvar alterações'}
        </button>
      </div>

      <div className="grid gap-5">
        <div className="panel p-5 grid gap-3">
          <span className="field-label !mb-0">Estado</span>
          <span className="badge w-fit" data-status={p.post.status}>{p.post.status}</span>
          <p className="text-[12px] text-muted leading-relaxed">
            {p.post.status === 'published' && `No ar desde ${(p.post.publishedAt || '').slice(0, 10)}.`}
            {p.post.status === 'scheduled' && `Entra no ar em ${new Date(p.post.scheduledFor!).toLocaleString('pt-BR')}.`}
            {p.post.status === 'draft' && 'Rascunho — ninguém vê ainda.'}
          </p>
          {p.post.status === 'published'
            ? <button type="button" className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider" disabled={disabled} onClick={p.onUnpublish}>tirar do ar</button>
            : <button type="button" className="cta cta-primary !py-2 font-display font-semibold text-[11px] uppercase tracking-wider" disabled={disabled} onClick={p.onPublish}>publicar agora</button>}

          <div className="grid gap-2 pt-2 border-t border-line">
            <label className="field-label !mb-0" htmlFor="ed-when">Agendar para</label>
            <input id="ed-when" type="datetime-local" className="field" value={when} disabled={disabled}
                   onChange={(e) => setWhen(e.target.value)} />
            <button type="button" className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider"
                    disabled={disabled} onClick={() => p.onSchedule(new Date(when))}>agendar</button>
          </div>
        </div>

        <div className="panel p-5 grid gap-3">
          <span className="field-label !mb-0">LinkedIn</span>
          {p.post.linkedinPostedAt ? (
            <p className="text-[12px] text-muted leading-relaxed">
              Compartilhado em {p.post.linkedinPostedAt.slice(0, 10)}. Um post vai ao LinkedIn uma vez só.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1" disabled={disabled}
                       checked={p.post.linkedinEnabled !== false} onChange={p.onToggleLinkedin} />
                <span>
                  <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Compartilhar no LinkedIn</span>
                  <span className="block text-[12px] text-muted mt-0.5 leading-relaxed">
                    Entra na fila assim que o post estiver no ar. A fila começa pelos posts mais antigos.
                  </span>
                </span>
              </label>
            </>
          )}
        </div>

        <div className="panel p-5 grid gap-3">
          <span className="field-label !mb-0">Editar com IA</span>
          <textarea className="field !min-h-[5rem]" placeholder="Ex.: deixe mais curto, tire o jargão e acrescente um contra-argumento na seção 2."
                    value={instruction} disabled={disabled} onChange={(e) => setInstruction(e.target.value)} />
          <button type="button" className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider"
                  disabled={disabled || !instruction.trim()} onClick={() => { p.onRevise(instruction); setInstruction('') }}>
            {p.busy === 'revise' ? 'reescrevendo…' : 'reescrever'}
          </button>
        </div>

        <div className="panel p-5 grid gap-3">
          <span className="field-label !mb-0">Capa</span>
          {p.post.image
            ? <img src={coverUrl(p.post.image)!} alt={p.post.image.alt} className="w-full aspect-[16/9] object-cover border border-line" />
            : <p className="text-[12px] text-muted">Sem capa.</p>}
          <div className="flex gap-2">
            <button type="button" disabled={disabled} onClick={p.onPickCover}
                    className="cta cta-primary !py-2 flex-1 justify-center font-display font-semibold text-[11px] uppercase tracking-wider">
              escolher imagem
            </button>
            {p.post.image && (
              <button type="button" disabled={disabled} onClick={p.onClearCover}
                      className="chip !h-9 justify-center font-display font-semibold text-[11px] uppercase tracking-wider">tirar</button>
            )}
          </div>
          <details className="border-t border-line pt-3">
            <summary className="field-label !mb-0 cursor-pointer">gerar uma capa direto pelo prompt</summary>
            <textarea className="field !min-h-[4.5rem] mt-2" placeholder="Descreva a cena (inglês)" value={coverPrompt}
                      disabled={disabled} onChange={(e) => setCoverPrompt(e.target.value)} />
            <button type="button" className="cta !py-2 w-full justify-center mt-2 font-display font-semibold text-[11px] uppercase tracking-wider"
                    disabled={disabled || !coverPrompt.trim()} onClick={() => p.onCover(coverPrompt)}>
              {p.busy === 'cover' ? 'gerando…' : 'gerar e usar'}
            </button>
          </details>
        </div>

        <button type="button" onClick={p.onDelete} disabled={disabled}
                className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider !text-red">
          apagar post
        </button>
      </div>
    </div>
  )
}
