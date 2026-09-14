import { useState } from 'react'
import type { Lang, Post } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { addSection, moveSection, paragraphsToText, parseTags, removeSection, setParagraphs } from '../../blog/editing'

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
}

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
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className="toggle-chip uppercase">{l}</button>
            ))}
          </div>
          <button type="button" onClick={p.onClose} className="chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider">voltar à lista</button>
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

        <div className="grid gap-4">
          <span className="field-label !mb-0">Seções ({lang})</span>
          {body.sections.map((section, i) => (
            <div key={i} className="border border-line p-3 grid gap-2">
              <div className="flex items-center gap-2">
                <input aria-label={`Título da seção ${i + 1}`} className="field" value={section.heading} disabled={disabled}
                       onChange={(e) => setBody({ ...body, sections: body.sections.map((s, j) => (j === i ? { ...s, heading: e.target.value } : s)) })} />
                <button type="button" className="toggle-chip" title="subir" disabled={disabled} onClick={() => setBody(moveSection(body, i, -1))}>↑</button>
                <button type="button" className="toggle-chip" title="descer" disabled={disabled} onClick={() => setBody(moveSection(body, i, +1))}>↓</button>
                <button type="button" className="toggle-chip" title="remover" disabled={disabled} onClick={() => setBody(removeSection(body, i))}>✕</button>
              </div>
              <textarea aria-label={`Parágrafos da seção ${i + 1}`} className="field" disabled={disabled}
                        placeholder="Um parágrafo por bloco — separe com uma linha em branco."
                        defaultValue={paragraphsToText(section)}
                        onBlur={(e) => setBody(setParagraphs(body, i, e.target.value))} />
            </div>
          ))}
          <button type="button" className="cta !py-2 !px-3 font-display font-semibold text-[11px] uppercase tracking-wider w-fit"
                  disabled={disabled} onClick={() => setBody(addSection(body))}>+ seção</button>
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
          <textarea className="field !min-h-[4.5rem]" placeholder="Descreva a cena (inglês)" value={coverPrompt}
                    disabled={disabled} onChange={(e) => setCoverPrompt(e.target.value)} />
          <button type="button" className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider"
                  disabled={disabled} onClick={() => p.onCover(coverPrompt)}>
            {p.busy === 'cover' ? 'gerando…' : 'gerar nova capa'}
          </button>
        </div>

        <button type="button" onClick={p.onDelete} disabled={disabled}
                className="cta !py-2 font-display font-semibold text-[11px] uppercase tracking-wider !text-red">
          apagar post
        </button>
      </div>
    </div>
  )
}
