import type { CSSProperties } from 'react'
import { useI18n } from '../i18n/useI18n'
import { MAX_LEVEL, marcos } from './career'
import { GITHUB, LINKEDIN } from './links'

/**
 * A carreira numa linha: cada marco é um alfinete do fio (`data-fio="kp"`). No desktop os marcos
 * sobem da esquerda para a direita (ano × senioridade); no celular viram uma lista vertical. A posição
 * é toda CSS (variáveis --f, --lv, --i), sem medir a tela. O fio termina entre os dedos da mão do
 * androide: a imagem é recortada (fundo transparente), sem fio nenhum, e fica POR CIMA do fio da página.
 */
/** Onde fica a fenda entre o indicador e o polegar em `mao-pinca-*.webp` (fração da imagem, medida no contorno). */
const PINCH = { x: 0.0643, y: 0.4131 }

export function CareerLine() {
  const { t, lang } = useI18n()
  const h = t.home
  const items = marcos(t.experience.items)
  const from = items[0]?.when ?? 0
  const span = Math.max(1, (items[items.length - 1]?.when ?? 1) - from)

  return (
    <section id="curriculo" className="fio-sec" data-fio="career">
      <div className="fio-wrap">
        <div className="fio-in">
          <h2 className="fio-d">{h.career}</h2>
          <p className="fio-lead">{h.careerLead}</p>
          <p className="fio-mono fio-stats">
            {t.hero.stats.map((s) => <span key={s.label}><b>{s.value}</b>{s.label}</span>)}
          </p>
          <ol className="fio-career" role="list" aria-label={h.careerChart} style={{ '--n': items.length } as CSSProperties}>
            {items.map((m, i) => (
              <li key={`${m.company}-${m.year}`} data-fio="kp"
                  className={`fio-kp${i === items.length - 1 ? ' is-end' : i % 2 ? ' is-up' : ''}`}
                  style={{ '--f': (m.when - from) / span, '--lv': (m.level - 1) / (MAX_LEVEL - 1), '--i': i } as CSSProperties}>
                <span className="fio-kp-lb"><b>{m.company}</b><small>{m.year} · {m.role}</small></span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="fio-finale" style={{ '--py': PINCH.y } as CSSProperties}>
        <div className="fio-hand-a"><h2 className="fio-d">{h.who}</h2></div>
        <div className="fio-hand-b">
          <p>{h.whoText}</p>
          <div className="fio-acts">
            <a className="fio-btn" href={lang === 'pt' ? '/cv-pt-br.pdf' : '/cv-en.pdf'}>{h.cv}</a>
            <a className="fio-lnk" href="/curriculo">{h.fullResume}</a>
            <a className="fio-lnk" href={LINKEDIN} target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a className="fio-lnk" href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
        <img className="fio-hand-img" data-fio="hand" data-pinch={`${PINCH.x},${PINCH.y}`} alt={h.handAlt} loading="lazy"
             src="/fio/mao-pinca-700.webp" srcSet="/fio/mao-pinca-700.webp 700w, /fio/mao-pinca-1166.webp 1166w"
             sizes="(min-width: 860px) 34vw, 70vw" width={1166} height={1312} />
      </div>
    </section>
  )
}
