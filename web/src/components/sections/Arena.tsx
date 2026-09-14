import { useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useArena } from '../../hooks/useArena'
import { useSectionView } from '../../hooks/useSectionView'
import { languageColor, rarity, sparklinePath, timeAgo, type Repo } from '../../data/repos'
import { gaEvt } from '../../analytics/ga'
import { Section, SectionHead } from '../ui/SectionHead'
import { Reveal } from '../ui/Reveal'
import { IconArrowUpRight, IconCommit, IconGitHub } from '../ui/Icons'
import type { Dictionary } from '../../i18n/types'

/** ARENA: public repos as loot cards. Loading / offline / empty / cards. Data only from /api/data. */
export function Arena() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useSectionView(ref, 'projects')
  const { arena, refetch } = useArena()
  const s = t.sections.projects

  return (
    <div ref={ref}>
    <Section id="projects">
      <SectionHead tag={s.tag} title={t.projects.heading} sub={s.sub}
        aside={arena?.status === 'online' && (
          <a href="https://github.com/rodrigorizandobr?tab=repositories" target="_blank" rel="noopener noreferrer"
             onClick={() => gaEvt('see_all_repos')} className="cta !py-2.5 !px-3 inline-flex items-center gap-2 font-display font-semibold text-[11px] uppercase tracking-wider">
            <IconGitHub width={14} height={14} />{s.see_all}<IconArrowUpRight width={12} height={12} />
          </a>
        )} />

      {!arena && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} data-testid="skeleton" className="panel p-5 flex flex-col gap-3">
              <div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-5/6" /><div className="skeleton h-8 w-full mt-2" />
            </div>
          ))}
        </div>
      )}

      {arena?.status === 'offline' && (
        <div role="alert" className="panel hud-frame p-8 text-center max-w-xl mx-auto">
          <div className="font-display font-bold tracking-[.2em] text-heading">{s.offline_title}</div>
          <p className="text-[13px] text-muted mt-2">{s.offline_text}</p>
          <button type="button" onClick={refetch} className="btn-start mt-6 !w-auto !px-8 !py-3 text-[12px]">{s.retry}</button>
        </div>
      )}

      {arena?.status === 'online' && arena.repos.length === 0 && (
        <p className="panel p-8 text-center text-muted">{s.empty}</p>
      )}

      {arena?.status === 'online' && arena.repos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {arena.repos.map((r, i) => <RepoCard key={r.name} repo={r} i={i} t={t} />)}
        </ul>
      )}
    </Section>
    </div>
  )
}

function RepoCard({ repo, i, t }: { repo: Repo; i: number; t: Dictionary }) {
  const [open, setOpen] = useState(false)
  const s = t.sections.projects
  const tier = rarity(repo.stargazers_count)
  const d = sparklinePath(repo.sparkline?.days)
  const commits = repo.sparkline?.commits ?? 0
  const color = languageColor(repo.language)

  return (
    <Reveal as="li" delay={Math.min(i, 5) * 0.05} className="list-none">
      <article className={`panel p-5 h-full flex flex-col gap-3 rarity-${tier}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-mono text-[14px] text-heading truncate">{repo.name}</h3>
            <div className="flex items-center gap-2 mt-1 font-mono text-[10.5px] text-muted">
              <span data-testid="lang-dot" className="inline-block w-2 h-2 rounded-full" style={{ background: color }} aria-hidden="true" />
              <span>{repo.language || '—'}</span>
              <span aria-hidden="true">·</span>
              <span>★ {repo.stargazers_count}</span>
            </div>
          </div>
          <span className={`hud-label !text-[9px] px-1.5 py-0.5 border ${tier === 'legendary' ? 'border-amber text-amber' : tier === 'rare' ? 'border-cyan text-cyan' : 'border-line'}`}>{s.rarity[tier]}</span>
        </div>

        {repo.description ? (
          <p className="text-[12.5px] leading-relaxed text-text line-clamp-2">{repo.description}</p>
        ) : repo.topics.length > 0 ? (
          <div className="flex flex-wrap gap-1">{repo.topics.map((tp) => <span key={tp} className="font-mono text-[10px] px-1.5 py-0.5 border border-line text-muted">#{tp}</span>)}</div>
        ) : null}

        <div className="mt-auto">
          <svg data-testid="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-8" aria-hidden="true">
            {d && <path d={`${d}L100,24L0,24Z`} fill="currentColor" className="text-cyan/10" />}
            {d ? <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="text-cyan" /> : <line x1="0" y1="23" x2="100" y2="23" stroke="currentColor" className="text-line" />}
          </svg>
          <div className="flex items-center justify-between font-mono text-[10.5px] text-muted mt-1">
            <span className="inline-flex items-center gap-1"><IconCommit width={12} height={12} /><b className="text-heading">{commits}</b> {s.commits28}</span>
            <span>{s.updated} {timeAgo(repo.pushed_at, t.projects.time_ago)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <a href={repo.html_url} target="_blank" rel="noopener noreferrer" aria-label={`${s.open}: ${repo.name}`}
             onClick={() => gaEvt('repo_link_click', { repo_name: repo.name })}
             className="cta flex-1 !py-2 !px-3 inline-flex items-center justify-between font-display font-semibold text-[11px] uppercase tracking-wider">
            {s.open}<IconArrowUpRight width={12} height={12} />
          </a>
          {repo.commits.length > 0 && (
            <button type="button" aria-expanded={open} aria-controls={`commits-${repo.name}`}
              onClick={() => { setOpen((o) => !o); if (!open) gaEvt('repo_card_flip', { repo_name: repo.name }) }}
              className="chip !h-9 font-display font-semibold text-[10.5px] uppercase tracking-wider cursor-pointer hover:border-red">
              {open ? s.collapse : s.expand}
            </button>
          )}
        </div>

        {open && (
          <ol id={`commits-${repo.name}`} className="border-t border-line pt-3 flex flex-col gap-2">
            {repo.commits.map((c) => (
              <li key={c.sha} className="grid grid-cols-[auto_1fr_auto] gap-2 items-baseline font-mono text-[11px]">
                <span className="text-red">{c.sha}</span>
                <span className="text-text truncate font-sans text-[12px]">{c.message}</span>
                <span className="text-muted">{timeAgo(c.date, t.projects.time_ago)}</span>
              </li>
            ))}
          </ol>
        )}
      </article>
    </Reveal>
  )
}
