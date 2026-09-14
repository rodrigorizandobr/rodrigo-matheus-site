import type { ReactElement, SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p })

export const IconLinkedIn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M6.5 8.5h-3V20h3V8.5ZM5 7a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 5 7Zm15 13h-3v-5.6c0-1.5-.5-2.4-1.8-2.4-1 0-1.6.7-1.9 1.3-.1.2-.1.6-.1.9V20h-3V8.5h3V10c.4-.7 1.3-1.7 3.1-1.7 2.3 0 3.7 1.5 3.7 4.6V20Z"/></svg>
)
export const IconGitHub = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>
)
export const IconDoc = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>
)
export const IconArrowUpRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 17 17 7M8 7h9v9"/></svg>
)
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M16 4 6 12l10 8V4Z"/></svg>
)
export const IconRepo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5v-16Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M9 6h6"/></svg>
)
export const IconCommit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/></svg>
)
export const IconSignal = ({ level = 3, ...p }: SVGProps<SVGSVGElement> & { level?: 0 | 1 | 2 | 3 }) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M4 18h.01" opacity={level >= 1 ? 1 : 0.2} /><path d="M8 18v-4" opacity={level >= 1 ? 1 : 0.2} />
    <path d="M12 18v-8" opacity={level >= 2 ? 1 : 0.2} /><path d="M16 18V6" opacity={level >= 3 ? 1 : 0.2} />
  </svg>
)
/* class / module glyphs */
export const IconCommand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
)
export const IconChip = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 10h4v4h-4zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2"/></svg>
)
export const IconLayers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>
)
export const IconBank = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 9.5 12 4l9 5.5H3ZM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>
)
export const CLASS_ICON: Record<string, (p: SVGProps<SVGSVGElement>) => ReactElement> = {
  'eng-manager': IconCommand, 'ai-strategist': IconChip, 'platform-architect': IconLayers, fintech: IconBank,
}
