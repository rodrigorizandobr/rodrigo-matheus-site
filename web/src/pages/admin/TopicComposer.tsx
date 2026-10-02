import { useState } from 'react'

type Props = {
  busy: boolean
  onWrite: (topic: string) => void
}

/** Modo "meu tema": o autor escreve o assunto, o servidor pesquisa na internet e escreve sobre ele. */
export function TopicComposer({ busy, onWrite }: Props) {
  const [topic, setTopic] = useState('')
  const ready = topic.trim() !== '' && !busy
  const submit = () => { if (ready) onWrite(topic.trim()) }

  return (
    <div className="grid gap-2">
      <div>
        <label className="field-label !mb-0" htmlFor="meu-tema">Sobre um tema que eu escolho</label>
        <p className="text-[11.5px] text-muted mt-1 leading-relaxed">
          Escreva o assunto. O robô pesquisa na internet (busca geral e notícias, de qualquer data) e escreve o
          post sobre ele. Se a busca não trouxer nada, o post não é escrito.
        </p>
      </div>
      <input id="meu-tema" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
             placeholder="ex.: RAG em produção, o que dá errado" />
      <button type="button" disabled={!ready} onClick={submit}
              className="cta cta-primary !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider w-full sm:w-fit">
        {busy ? 'pesquisando e escrevendo…' : 'pesquisar e escrever'}
      </button>
    </div>
  )
}
