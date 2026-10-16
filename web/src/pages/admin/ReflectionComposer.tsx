import { useState } from 'react'

type Props = {
  busy: boolean
  onWrite: (theme: string, withImage: boolean) => void
}

/**
 * Modo "reflexão": sem notícia, curto, ancorado numa cena real da carreira — formato
 * tipo LinkedIn top voice, não o artigo de 3 seções sobre novidade da semana.
 *
 * Tema é opcional: vazio gira entre os temas cadastrados (igual às últimas notícias);
 * escrito, o autor escolhe o ângulo. Capa também é opcional — nem todo post de top
 * voice tem imagem; às vezes é só o texto.
 */
export function ReflectionComposer({ busy, onWrite }: Props) {
  const [theme, setTheme] = useState('')
  const [withImage, setWithImage] = useState(true)
  const submit = () => { if (!busy) onWrite(theme.trim(), withImage) }

  return (
    <div className="grid gap-2">
      <div>
        <span className="field-label !mb-0">Reflexão pessoal, sem notícia</span>
        <p className="text-[11.5px] text-muted mt-1 leading-relaxed">
          Curto, no estilo de quem para o feed com uma frase: uma cena real da sua carreira e uma pergunta pro
          leitor. Deixe o campo em branco para girar entre os temas cadastrados, ou escreva um tema específico.
        </p>
      </div>
      <input className="field" value={theme} onChange={(e) => setTheme(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
             placeholder="deixe em branco, ou escreva um tema" />
      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-muted">
        <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
        com capa de IA (desmarcado, sai só texto)
      </label>
      <button type="button" disabled={busy} onClick={submit}
              className="cta cta-primary !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider w-full sm:w-fit">
        {busy ? 'escrevendo…' : 'escrever reflexão'}
      </button>
    </div>
  )
}
