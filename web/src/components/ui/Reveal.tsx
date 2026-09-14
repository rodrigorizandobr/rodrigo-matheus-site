import { useRef, type ElementType, type ReactNode } from 'react'
import { useScrollReveal } from '../../hooks/useScrollReveal'

/** Fade-up-on-enter wrapper. `as` keeps the semantics (article/li) intact. */
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...rest }: { as?: ElementType; delay?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null)
  useScrollReveal(ref, { delay })
  return <Tag ref={ref} className={className} {...rest}>{children}</Tag>
}
