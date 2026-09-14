import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { Hero } from './components/sections/Hero'
import { About } from './components/sections/About'
import { Campaigns } from './components/sections/Campaigns'
import { Arena } from './components/sections/Arena'
import { Training } from './components/sections/Training'
import { Contact } from './components/sections/Contact'
import { Logs } from './components/sections/Logs'
import { useI18n } from './i18n/useI18n'
import { Stage } from './stage/Stage'
import { BlogPage } from './pages/BlogPage'
import { currentRoute } from './pages/router'
import { useEffect, useState } from 'react'

export default function App() {
  const { t } = useI18n()
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const on = () => setRoute(currentRoute())
    window.addEventListener('popstate', on); window.addEventListener('hashchange', on)
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('hashchange', on) }
  }, [])

  if (route.page === 'blog') {
    return (
      <>
        <Header />
        <main className="relative z-10"><BlogPage slug={route.slug} /></main>
        <div className="relative z-10"><Footer /></div>
      </>
    )
  }

  return (
    <>
      <a href="#about" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-red focus:text-white focus:px-3 focus:py-2">{t.skip}</a>
      <Stage />
      <Header />
      <main className="relative z-10">
        <Hero />
        <About />
        <Campaigns />
        <Arena />
        <Training />
        <Logs />
        <Contact />
      </main>
      <div className="relative z-10"><Footer /></div>
    </>
  )
}
