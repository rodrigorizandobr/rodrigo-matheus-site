import { useI18n } from '../../i18n/useI18n'

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="border-t border-line/70 mt-8 bg-surface/90">
      <div className="w-[min(var(--max),96vw)] mx-auto py-6 font-mono text-[11px] text-muted">
        <span>{t.footer}</span>
      </div>
    </footer>
  )
}
