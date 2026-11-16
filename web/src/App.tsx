import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { About } from './components/sections/About'
import { Campaigns } from './components/sections/Campaigns'
import { Arena } from './components/sections/Arena'
import { Training } from './components/sections/Training'
import { Contact } from './components/sections/Contact'
import { useI18n } from './i18n/useI18n'
import { BlogPage } from './pages/BlogPage'
import { HomePage } from './pages/HomePage'
import { currentRoute } from './pages/router'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useHashLanding } from './hooks/useHashLanding'

// O painel e o simulador carregam o SDK do Firebase (~100 kB gzip). Sob demanda de
// propósito: quem só lê o site nunca baixa isso.
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const PlannerPage = lazy(() => import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage })))
const PensionPage = lazy(() => import('./pages/PensionPage').then((m) => ({ default: m.PensionPage })))

const OLD_SECTIONS = ['#about', '#experience', '#projects', '#education', '#contact']

export default function App() {
  const { t } = useI18n()
  const [route, setRoute] = useState(currentRoute)
  useHashLanding(route.page === 'home' || route.page === 'curriculo')
  // As seções de carreira moravam na home: link antigo para /#about, /#contact… segue valendo.
  useEffect(() => {
    if (route.page === 'home' && OLD_SECTIONS.includes(window.location.hash)) window.location.replace(`/curriculo${window.location.hash}`)
  }, [route.page])
  useEffect(() => {
    const on = () => setRoute(currentRoute())
    window.addEventListener('popstate', on); window.addEventListener('hashchange', on)
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('hashchange', on) }
  }, [])

  if (route.page === 'admin') {
    return (
      <>
        <Header />
        <main className="relative z-10" data-stage="false">
          <Suspense fallback={<div className="w-[min(var(--max),94vw)] mx-auto py-16 text-muted text-[13px]">Carregando painel…</div>}>
            <AdminPage />
          </Suspense>
        </main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  if (route.page === 'planner') {
    return (
      <>
        <Header />
        <main className="relative z-10" data-stage="false">
          <Suspense fallback={<div className="w-[min(var(--max),94vw)] mx-auto py-16 text-muted text-[13px]">Carregando simulador…</div>}>
            <PlannerPage />
          </Suspense>
        </main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  if (route.page === 'pension') {
    return (
      <>
        <Header />
        <main className="relative z-10" data-stage="false">
          <Suspense fallback={<div className="w-[min(var(--max),94vw)] mx-auto py-16 text-muted text-[13px]">Carregando simulador…</div>}>
            <PensionPage />
          </Suspense>
        </main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  if (route.page === 'blog') {
    return (
      <>
        <Header />
        <main className="relative z-10" data-stage="false"><BlogPage slug={route.slug} /></main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  if (route.page === 'curriculo') {
    return (
      <>
        <a href="#about" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-red focus:text-white focus:px-3 focus:py-2">{t.skip}</a>
        <Header />
        <main className="relative z-10" data-stage="false">
          <About />
          <Campaigns />
          <Arena />
          <Training />
          <Contact />
        </main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  return (
    <>
      <a href="#blog" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-red focus:text-white focus:px-3 focus:py-2">{t.skip}</a>
      <Header />
      <main className="relative z-10" data-stage="false"><HomePage /></main>
      <div className="relative z-10"><Footer /></div>
    </>
  )
}
