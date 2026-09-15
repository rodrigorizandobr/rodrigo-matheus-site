import type { ReactNode } from 'react'

/**
 * Cabeçalho de seção: só o título, marcado pelas duas barras.
 *
 * A etiqueta em caixa alta e a linha de apoio que vinham acima saíram — três níveis de
 * texto antes do título faziam a seção começar devagar, e nenhum deles dizia mais do que
 * o próprio título. `aside` continua para quem precisa de uma ação à direita.
 */
export function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <header className="section-head">
      <h2 className="section-title"><span className="slash">//</span>{title}</h2>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </header>
  )
}

export function Section({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} data-scene={id} className={`section relative z-10 w-[min(var(--max),94vw)] mx-auto py-16 md:py-20 ${className}`}>
      {children}
    </section>
  )
}
