import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { I18nProvider } from './i18n/useI18n'
import { initSmoothScroll } from './motion/lenis'

initSmoothScroll()

if (import.meta.env.DEV) {
  // Surface async failures (e.g. R3F's async renderer setup) where DOM tooling can read them.
  const report = (kind: string, reason: unknown) => {
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
    document.documentElement.dataset.lastError = `${kind}: ${msg}`.slice(0, 2000)
    console.error(`[dev:${kind}]`, reason)
  }
  window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason))
  window.addEventListener('error', (e) => report('error', e.error ?? e.message))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
