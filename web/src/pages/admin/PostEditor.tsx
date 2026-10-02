import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Lang, Post } from '../../blog/types'
import { coverUrl } from '../../blog/types'
import { DISCARD_QUESTION, formatDay, parseTags, statusLabel } from '../../blog/editing'
import { BodyEditor } from './BodyEditor'

type Props = {
  post: Post
  busy: string | null
  dirty: boolean
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
  onShareLinkedin: () => void
}

/**
 * Editor do post. O corpo é UM campo de texto por idioma (`##` abre seção), e não
 * uma caixa por seção — ver BodyEditor.tsx e blog/editing.ts.
 *
 * Duas colunas: o texto à esquerda; à direita, cartões com UMA decisão cada
 * (publicação, LinkedIn, capa, IA, exclusão). A barra do topo fica fixa para que
 * salvar e voltar estejam sempre à mão, por mais longo que seja o texto.
 */

const BTN = 'font-display font-semibold text-[11px] uppercase tracking-wider'

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
  const [tagsText, setTagsText] = useState(() => p.post.tags.join(', '))
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const body = p.post.i18n?.[lang] ?? { title: '', excerpt: '', sections: [] }
  const setBody = (next: typeof body) => p.onChange({ ...p.post, i18n: { ...p.post.i18n, [lang]: next } })
  const disabled = p.busy !== null
  const { status } = p.post

  // O título cresce com o texto: uma linha cortada esconde justamente o que se quer revisar.
  // Largura da tela e fonte carregando depois mudam as quebras de linha, então medem de novo.
  const fitTitle = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`
  }, [])
  useLayoutEffect(fitTitle, [fitTitle, body.title, lang])
  useEffect(() => {
    window.addEventListener('resize', fitTitle)
    void document.fonts?.ready.then(fitTitle)
    return () => window.removeEventListener('resize', fitTitle)
  }, [fitTitle])

  // Uma revisão por IA troca as tags por baixo do campo: o texto local acompanha.
  const tagsKey = p.post.tags.join(', ')
  useEffect(() => {
    setTagsText((atual) => (parseTags(atual).join(', ') === tagsKey ? atual : tagsKey))
  }, [tagsKey])

  const close = () => {
    if (p.dirty && !window.confirm(DISCARD_QUESTION)) return
    p.onClose()
  }

  return (
    <div className="grid gap-5">
      <div className="panel sticky top-[var(--header-h)] z-10 !bg-[var(--bg)] p-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <button type="button" onClick={close} className={`chip !h-8 ${BTN}`}>← voltar à lista</button>
        <div className="flex gap-1">
          {(['pt', 'en'] as Lang[]).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className="toggle-chip">{l.toUpperCase()}</button>
          ))}
        </div>
        <span className="badge" data-status={status}>{statusLabel(status)}</span>
        <div className="flex items-center gap-2 ml-auto">
          {p.dirty && <span className="text-[12px] text-red" role="status">alterações não salvas</span>}
          <button type="button" onClick={p.onPreview} className={`chip !h-8 ${BTN}`}>visualizar</button>
          <button type="button" onClick={p.onSave} disabled={disabled || !p.dirty}
                  className={`cta cta-primary !py-2 ${BTN}`}>
            {p.busy === 'save' ? 'salvando…' : 'salvar'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] items-start">
        <div className="panel p-5 md:p-7 grid gap-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label className="field-label" htmlFor="ed-title">Título ({lang})</label>
              <span className="text-[11px] text-muted tabular-nums">{body.title.length} caracteres</span>
            </div>
            <textarea id="ed-title" ref={titleRef} rows={1}
                      className="field !min-h-0 resize-none overflow-hidden font-display text-[1.15rem] leading-snug"
                      value={body.title} disabled={disabled}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                      onChange={(e) => setBody({ ...body, title: e.target.value.replace(/\s*\n+\s*/g, ' ') })} />
          </div>

          <div>
            <label className="field-label" htmlFor="ed-excerpt">Resumo ({lang})</label>
            <textarea id="ed-excerpt" className="field !min-h-[4.5rem]" value={body.excerpt} disabled={disabled}
                      onChange={(e) => setBody({ ...body, excerpt: e.target.value })} />
          </div>

          <BodyEditor id="ed-body" lang={lang} sections={body.sections} disabled={disabled}
                      resetKey={`${p.post.id}-${lang}`} onLang={setLang}
                      onChange={(sections) => setBody({ ...body, sections })} />

          <div>
            <label className="field-label" htmlFor="ed-tags">Tags (separadas por vírgula, até 6)</label>
            <input id="ed-tags" className="field" value={tagsText} disabled={disabled}
                   onChange={(e) => { setTagsText(e.target.value); p.onChange({ ...p.post, tags: parseTags(e.target.value) }) }}
                   onBlur={() => setTagsText(parseTags(tagsText).join(', '))} />
          </div>
        </div>

        <div className="grid gap-5">
          <div className="panel p-5 grid gap-3">
            <span className="field-label !mb-0">Publicação</span>
            <p className="text-[12px] text-muted leading-relaxed">
              {status === 'published' && `No ar desde ${formatDay(p.post.publishedAt)}.`}
              {status === 'scheduled' && `Entra no ar em ${new Date(p.post.scheduledFor!).toLocaleString('pt-BR')}.`}
              {status === 'draft' && 'Rascunho — ninguém vê ainda.'}
            </p>

            {status === 'published' ? (
              <>
                <a className={`cta !py-2 text-center ${BTN}`} href={`/blog/${p.post.slug}`} target="_blank" rel="noreferrer">ver no site ↗</a>
                <button type="button" className={`cta !py-2 ${BTN}`} disabled={disabled} onClick={p.onUnpublish}>tirar do ar</button>
              </>
            ) : (
              <>
                <button type="button" className={`cta cta-primary !py-2 ${BTN}`} disabled={disabled} onClick={p.onPublish}>publicar agora</button>
                <details className="border-t border-line pt-3">
                  <summary className="field-label !mb-0 cursor-pointer">
                    {status === 'scheduled' ? 'mudar o horário' : 'agendar para depois'}
                  </summary>
                  <div className="grid gap-2 mt-2">
                    <label className="sr-only" htmlFor="ed-when">Data e hora da publicação</label>
                    <input id="ed-when" type="datetime-local" className="field" value={when} disabled={disabled}
                           onChange={(e) => setWhen(e.target.value)} />
                    <button type="button" className={`cta !py-2 ${BTN}`}
                            disabled={disabled || !when} onClick={() => p.onSchedule(new Date(when))}>agendar</button>
                  </div>
                </details>
              </>
            )}
          </div>

          <div className="panel p-5 grid gap-3">
            <span className="field-label !mb-0">LinkedIn</span>
            {p.post.linkedinPostedAt ? (
              <>
                <p className="text-[12px] text-muted leading-relaxed">No LinkedIn desde {formatDay(p.post.linkedinPostedAt)}.</p>
                <button type="button" className={`cta !py-2 ${BTN}`} disabled={disabled} onClick={p.onShareLinkedin}>
                  {p.busy === 'linkedin' ? 'publicando…' : 'publicar de novo no LinkedIn'}
                </button>
              </>
            ) : (
              <>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1" disabled={disabled}
                         checked={p.post.linkedinEnabled !== false} onChange={p.onToggleLinkedin} />
                  <span>
                    <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Entrar na fila do LinkedIn</span>
                    <span className="block text-[12px] text-muted mt-0.5 leading-relaxed">
                      {status === 'published'
                        ? 'Vai no próximo dia agendado. A fila começa pelos posts mais antigos.'
                        : 'A fila só começa quando estiver no ar.'}
                    </span>
                  </span>
                </label>
                <button type="button" className={`cta !py-2 ${BTN}`} disabled={disabled} onClick={p.onShareLinkedin}>
                  {p.busy === 'linkedin' ? 'publicando…' : 'publicar no LinkedIn agora'}
                </button>
              </>
            )}
          </div>

          <div className="panel p-5 grid gap-3">
            <span className="field-label !mb-0">Capa</span>
            {p.post.image
              ? <img src={coverUrl(p.post.image)!} alt={p.post.image.alt} className="w-full aspect-[16/9] object-cover border border-line" />
              : <p className="text-[12px] text-muted">Sem capa.</p>}
            <div className="flex gap-2">
              <button type="button" disabled={disabled} onClick={p.onPickCover}
                      className={`cta cta-primary !py-2 flex-1 justify-center ${BTN}`}>
                escolher imagem
              </button>
              {p.post.image && (
                <button type="button" disabled={disabled} onClick={p.onClearCover}
                        className={`chip !h-9 justify-center ${BTN}`}>tirar</button>
              )}
            </div>
            <details className="border-t border-line pt-3">
              <summary className="field-label !mb-0 cursor-pointer">gerar uma capa direto pelo prompt</summary>
              <textarea className="field !min-h-[4.5rem] mt-2" placeholder="Descreva a cena (inglês)" value={coverPrompt}
                        disabled={disabled} onChange={(e) => setCoverPrompt(e.target.value)} />
              <button type="button" className={`cta !py-2 w-full justify-center mt-2 ${BTN}`}
                      disabled={disabled || !coverPrompt.trim()} onClick={() => p.onCover(coverPrompt)}>
                {p.busy === 'cover' ? 'gerando…' : 'gerar e usar'}
              </button>
            </details>
          </div>

          <div className="panel p-5 grid gap-3">
            <span className="field-label !mb-0">Editar com IA</span>
            <textarea className="field !min-h-[5rem]" placeholder="Ex.: deixe mais curto, tire o jargão e acrescente um contra-argumento na seção 2."
                      value={instruction} disabled={disabled} onChange={(e) => setInstruction(e.target.value)} />
            <button type="button" className={`cta !py-2 ${BTN}`}
                    disabled={disabled || !instruction.trim()} onClick={() => { p.onRevise(instruction); setInstruction('') }}>
              {p.busy === 'revise' ? 'reescrevendo…' : 'reescrever'}
            </button>
          </div>

          <div className="panel p-5 grid gap-3">
            <span className="field-label !mb-0">Zona de perigo</span>
            <p className="text-[12px] text-muted leading-relaxed">Apaga o post do painel e do site. Não dá para desfazer.</p>
            <button type="button" onClick={p.onDelete} disabled={disabled}
                    className={`cta !py-2 ${BTN} !text-red`}>
              excluir post
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
