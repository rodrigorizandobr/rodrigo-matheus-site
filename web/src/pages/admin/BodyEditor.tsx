import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Lang, Section } from '../../blog/types'
import { countWords, insertSection, sectionsToText, textToSections, toggleHeading } from '../../blog/editing'
import type { Edit } from '../../blog/editing'

type Props = {
  id: string
  lang: Lang
  sections: Section[]
  disabled: boolean
  /** Muda quando é outro post ou outro idioma: o texto local é refeito a partir das seções. */
  resetKey?: string
  onChange: (sections: Section[]) => void
  onLang: (lang: Lang) => void
}

const BTN = 'chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider'

/**
 * Corpo do post: um texto com `##` abrindo seção (ver blog/editing.ts), agora com
 * barra de formatação e modo tela cheia. A barra não inventa marcação: só mexe nos
 * `##` e nas linhas em branco, que é o que o textToSections entende — HTML livre
 * continua fora de questão.
 *
 * O texto vive aqui, não no pai: alternar tela cheia troca o <textarea> de lugar
 * no DOM (portal), e o estado local é o que impede perder o que foi digitado.
 * As seções só sobem ao pai ao sair do campo / da tela cheia — converter a cada
 * tecla jogaria o cursor para o fim.
 */
export function BodyEditor({ id, lang, sections, disabled, resetKey, onChange, onLang }: Props) {
  const [text, setText] = useState(() => sectionsToText(sections))
  const [seen, setSeen] = useState(resetKey)
  const [full, setFull] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<[number, number] | null>(null)

  if (seen !== resetKey) {
    setSeen(resetKey)
    setText(sectionsToText(sections))
  }

  const commit = () => onChange(textToSections(text))

  useLayoutEffect(() => {
    const sel = pendingSel.current
    if (sel && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(sel[0], sel[1])
      pendingSel.current = null
    }
  }, [text])

  useEffect(() => {
    if (full) ref.current?.focus()
  }, [full])

  const apply = (make: (value: string, a: number, b: number) => Edit) => {
    const ta = ref.current
    if (!ta || disabled) return
    const edit = make(ta.value, ta.selectionStart, ta.selectionEnd)
    pendingSel.current = [edit.start, edit.end]
    setText(edit.text)
  }

  const leave = () => {
    commit()
    setFull(false)
  }

  const textarea = (extra: string) => (
    <textarea ref={ref} id={id} className={`field ${extra}`} disabled={disabled} value={text}
              onChange={(e) => setText(e.target.value)} onBlur={commit} />
  )

  const toolbar = (
    <div className="flex items-center gap-2 flex-wrap flex-1" role="toolbar" aria-label="Formatação">
      <button type="button" className={BTN} disabled={disabled}
              onClick={() => apply(toggleHeading)}>título de seção</button>
      <button type="button" className={BTN} disabled={disabled}
              onClick={() => apply((v, a) => insertSection(v, a))}>nova seção</button>
      <span className="text-[11.5px] text-muted ml-auto">{countWords(text)} palavras</span>
    </div>
  )

  if (full) {
    return createPortal(
      <div role="dialog" aria-modal="true" aria-label="Editor em tela cheia"
           className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg)] overscroll-contain"
           onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); leave() } }}>
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-line">
          <div className="flex gap-1">
            {(['pt', 'en'] as Lang[]).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} className="toggle-chip"
                      onClick={() => { commit(); onLang(l) }}>{l.toUpperCase()}</button>
            ))}
          </div>
          {toolbar}
          <button type="button" className={BTN} onClick={leave}>sair da tela cheia</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 py-6">
          <div className="mx-auto w-full max-w-3xl h-full flex flex-col">
            <label className="sr-only" htmlFor={id}>Conteúdo ({lang})</label>
            {textarea('flex-1 !min-h-[60vh] !resize-none text-[17px] leading-[1.8]')}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <label className="field-label !mb-0" htmlFor={id}>Conteúdo ({lang})</label>
        <button type="button" className={BTN} onClick={() => { commit(); setFull(true) }}>tela cheia</button>
      </div>
      <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
        Um campo só. Comece uma linha com <code className="font-mono">##</code> para abrir uma seção;
        deixe uma linha em branco entre parágrafos.
      </p>
      <div className="mb-2">{toolbar}</div>
      {textarea('!min-h-[24rem] leading-[1.7]')}
    </div>
  )
}
