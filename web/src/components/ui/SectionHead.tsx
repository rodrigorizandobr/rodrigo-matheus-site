import type { ReactNode } from 'react'
import { SceneBand } from '../../stage/SceneBand'

export function SectionHead({ tag, title, sub, aside }: { tag: string; title: string; sub: string; aside?: ReactNode }) {
  return (
    <header className="section-head">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="section-tag">{tag}</span>
          <span className="h-px w-10 bg-heading/30" aria-hidden="true" />
          <span className="hud-label">{sub}</span>
        </div>
        <h2 className="section-title"><span className="slash">//</span>{title}</h2>
      </div>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </header>
  )
}

export function Section({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} data-scene={id} className={`section relative z-10 w-[min(var(--max),94vw)] mx-auto py-16 md:py-20 ${className}`}>
      <SceneBand section={id} />
      {children}
    </section>
  )
}
