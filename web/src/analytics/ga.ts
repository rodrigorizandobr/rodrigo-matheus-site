/**
 * GA4 event helper — same contract as gaEvt() in v2: every event carries
 * `language` read from localStorage.lang so dashboards keep working.
 * v2 names kept: hero_click, contact_click, language_switch, nav_click,
 * repo_card_flip, repo_link_click, section_view, see_all_repos, data_load_error.
 * v3 additions: class_select, cta_start, robot_interact, scroll_depth.
 */
export type GaParams = Record<string, string | number | boolean>

declare global {
  interface Window { gtag?: (...args: unknown[]) => void }
}

function currentLang(): string {
  try {
    return localStorage.getItem('lang') || 'en'
  } catch {
    return 'en'
  }
}

export function gaEvt(name: string, params: GaParams = {}): void {
  const g = window.gtag
  if (typeof g !== 'function') return // ad blocker / not loaded — never break the UI
  g('event', name, { ...params, language: currentLang() })
}
