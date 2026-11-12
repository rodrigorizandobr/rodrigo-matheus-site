import { useState } from 'react'

const chave = (titulo: string) => `planner:grupo:${titulo}`

function lembrado(titulo: string, padrao: boolean): boolean {
  try {
    const v = window.localStorage.getItem(chave(titulo))
    return v === null ? padrao : v === '1'
  } catch {
    return padrao
  }
}

/**
 * Um grupo do formulário que abre e fecha (`<details>` nativo: teclado e leitor de tela de graça).
 * Começa como `inicial` e lembra a última escolha da pessoa. Fechado, os campos continuam no DOM.
 */
export function Group({ title, inicial = 'fechado', children }: {
  title: string
  inicial?: 'aberto' | 'fechado'
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(() => lembrado(title, inicial === 'aberto'))
  return (
    <details
      open={aberto}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open
        setAberto(open)
        try { window.localStorage.setItem(chave(title), open ? '1' : '0') } catch { /* sem armazenamento: vale o padrão */ }
      }}
      className="panel hud-frame p-5 min-w-0"
    >
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="hud-label">{title}</span>
        <span aria-hidden="true" className="font-display font-bold text-[14px] text-muted">{aberto ? '−' : '+'}</span>
      </summary>
      <div className="grid gap-5 mt-5">{children}</div>
    </details>
  )
}
