import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { nudgeThread } from '../thread/Thread'
import { brl, whole } from './format'
import type { Previa } from './previa'

type Engine = (aporteMensal: number, anos: number) => Previa

const APORTE = { min: 500, max: 8000, step: 250, start: 4000 }
const PRAZO = { min: 5, max: 25, step: 1, start: 15 }

/**
 * A prévia do "Vivendo de imóveis": dois controles e a curva do patrimônio — e a curva é o próprio
 * fio da página (cada ponto é um `data-fio="cp"`). O motor é o do simulador (`previa.ts`), carregado
 * só quando a seção se aproxima da tela: quem lê o blog não baixa o simulador à toa.
 */
export function Preview({ engine }: { engine?: Engine }) {
  const { t, lang } = useI18n()
  const h = t.home
  const box = useRef<HTMLDivElement>(null)
  const [calc, setCalc] = useState<Engine | null>(() => engine ?? null)
  const [aporte, setAporte] = useState(APORTE.start)
  const [anos, setAnos] = useState(PRAZO.start)
  // a conta custa ~100 ms: adiada, o controle continua seguindo o dedo
  const aporteCalmo = useDeferredValue(aporte)
  const anosCalmo = useDeferredValue(anos)

  useEffect(() => {
    if (calc || !box.current) return
    let alive = true
    const load = () => void import('./previa').then((m) => { if (alive) setCalc(() => m.previa) })
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { io.disconnect(); load() } }, { rootMargin: '800px' })
    io.observe(box.current)
    return () => { alive = false; io.disconnect() }
  }, [calc])

  const result = useMemo(() => (calc ? calc(aporteCalmo, anosCalmo) : null), [calc, aporteCalmo, anosCalmo])
  const ceiling = useMemo(() => (calc ? Math.max(1, calc(APORTE.max, anosCalmo).patrimonio) : 1), [calc, anosCalmo])
  useEffect(() => { nudgeThread() }, [result])

  const pontos = result?.pontos ?? [0, 0.25, 0.5, 0.75, 1].map((f) => ({ ano: anos * f, patrimonio: 0 }))
  const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''))
  const studios = !result ? '' : result.imoveis === 0 ? h.previewNone
    : fill(result.imoveis === 1 ? h.previewOneStudio : h.previewStudios, { n: result.imoveis, income: whole(result.renda, lang) })

  return (
    <div className="fio-bench" ref={box}>
      <div className="fio-bench-top">
        <div>
          <p className="fio-mono">{h.previewLabel}</p>
          <div className="fio-res">{result ? brl(result.patrimonio, lang) : 'R$ …'}</div>
          <p className="fio-res-text">
            {result ? `${fill(h.previewSummary, { years: anosCalmo, amount: whole(aporteCalmo, lang) })} ${studios}` : h.previewLoading}
          </p>
        </div>
        <a className="fio-btn" href="/vivendo-de-imoveis">{h.openFull} →</a>
      </div>
      <div className="fio-chart" role="img" aria-label={h.previewChart}>
        <div className="fio-plot">
          {pontos.map((p, i) => (
            <i key={i} className="fio-cp" data-fio="cp"
               style={{ left: `${(i / Math.max(1, pontos.length - 1)) * 100}%`, top: `${(1 - Math.min(1, p.patrimonio / ceiling)) * 100}%` }}>
              <span className="fio-mono">{i === 0 ? h.today : fill(h.year, { n: Math.round(p.ano) })}</span>
            </i>
          ))}
        </div>
      </div>
      <div className="fio-ctl">
        <div className="fio-field">
          <div className="fio-mono fio-field-top">
            <label htmlFor="fio-aporte">{h.monthly}</label>
            <output htmlFor="fio-aporte">R$ {whole(aporte, lang)}</output>
          </div>
          <input id="fio-aporte" type="range" min={APORTE.min} max={APORTE.max} step={APORTE.step} value={aporte}
                 onChange={(e) => setAporte(Number(e.target.value))} />
        </div>
        <div className="fio-field">
          <div className="fio-mono fio-field-top">
            <label htmlFor="fio-prazo">{h.term}</label>
            <output htmlFor="fio-prazo">{fill(h.years, { n: anos })}</output>
          </div>
          <input id="fio-prazo" type="range" min={PRAZO.min} max={PRAZO.max} step={PRAZO.step} value={anos}
                 onChange={(e) => setAnos(Number(e.target.value))} />
        </div>
      </div>
      <p className="fio-fine">{h.previewNote}</p>
    </div>
  )
}

export function Tools() {
  const { t } = useI18n()
  const h = t.home
  const cards = [
    { href: '/vivendo-de-imoveis', img: '/fio/imoveis-900.webp', title: h.plannerTitle, text: h.plannerText, alt: h.plannerAlt },
    { href: '/previdencia-privada', img: '/fio/previdencia-900.webp', title: h.pensionTitle, text: h.pensionText, alt: h.pensionAlt },
  ]
  return (
    <section id="utilitarios" className="fio-sec fio-tools">
      <div className="fio-wrap">
        <div className="fio-in">
          <h2 className="fio-d">{h.tools}</h2>
          <p className="fio-lead">{h.toolsLead}</p>
          <Preview />
          <div className="fio-cards">
            {cards.map((c) => (
              <a key={c.href} className="fio-card" href={c.href}>
                <div className="fio-card-pic"><img src={c.img} alt={c.alt} loading="lazy" width={900} height={672} /></div>
                <div className="fio-card-tx">
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <span className="fio-card-go">{h.simulate} →</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
