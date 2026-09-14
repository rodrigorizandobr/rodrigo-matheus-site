import { useState } from 'react'
import type { BlogConfig } from '../../blog/types'
import { describeSchedule, nextRunHint, weekdayLabels } from '../../blog/editing'

/**
 * Configuração do robô, em três blocos que respondem a três perguntas:
 * SOBRE O QUE escrever, COM O QUE pesquisar, e QUANDO publicar.
 *
 * Cada campo traz a explicação embaixo. A versão anterior tinha um campo "Pauta"
 * que não dizia o que era — e o PO, dono do produto, perguntou o que significava.
 */
export function ConfigPanel({ config, busy, onSave }: {
  config: BlogConfig
  busy: boolean
  onSave: (patch: Partial<BlogConfig>) => void
}) {
  const [draft, setDraft] = useState<BlogConfig>(config)
  const set = <K extends keyof BlogConfig>(key: K, value: BlogConfig[K]) => setDraft({ ...draft, [key]: value })

  const toggleDay = (day: number) =>
    set('generate_weekdays', draft.generate_weekdays.includes(day)
      ? draft.generate_weekdays.filter((d) => d !== day)
      : [...draft.generate_weekdays, day].sort((a, b) => a - b))

  const contar = (lista: string[]) => lista.filter((t) => t.trim()).length

  return (
    <div className="grid gap-5">
      <section className="panel p-5 md:p-7 grid gap-5">
        <header>
          <h2 className="font-display font-semibold text-heading text-[15px]">1. Sobre o que escrever</h2>
          <p className="text-[12px] text-muted mt-1">
            Os assuntos que o robô acompanha. Ele escolhe um por vez, em rodízio, e parte do que saiu de novo sobre ele.
          </p>
        </header>

        <div>
          <label className="field-label" htmlFor="cfg-news">Assuntos — um por linha</label>
          <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
            O robô passa por todos antes de repetir qualquer um. Lista vazia significa que ele não tem sobre o que
            escrever sozinho.
          </p>
          <textarea id="cfg-news" className="field !min-h-[9rem] font-mono !text-[12.5px]"
                    value={draft.news_terms.join('\n')}
                    onChange={(e) => set('news_terms', e.target.value.split('\n'))} />
          <p className="font-mono text-[11px] text-muted mt-1">{contar(draft.news_terms)} termos</p>
        </div>

      </section>

      <section className="panel p-5 md:p-7 grid gap-4">
        <header>
          <h2 className="font-display font-semibold text-heading text-[15px]">2. Pesquisa de notícias</h2>
          <p className="text-[12px] text-muted mt-1">
            Antes de escrever, o robô busca <strong>notícias no Brasil</strong> sobre o assunto e lê as páginas
            encontradas. As fontes saem citadas em ABNT no fim do post.
          </p>
        </header>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={draft.research_enabled} className="mt-1"
                 onChange={(e) => set('research_enabled', e.target.checked)} />
          <span>
            <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Buscar notícias antes de escrever</span>
            <span className="block text-[12px] text-muted mt-0.5 leading-relaxed">
              Desligado — ou quando a busca não traz nada — o post é escrito a partir do <strong>seu currículo</strong>:
              as empresas, os times e os números da sua carreira viram o material de apoio, em vez de o modelo escrever
              de memória. Ao gerar um post na mão você decide caso a caso.
            </span>
          </span>
        </label>
      </section>

      <section className="panel p-5 md:p-7 grid gap-5">
        <header>
          <h2 className="font-display font-semibold text-heading text-[15px]">3. Quando escrever e publicar</h2>
          <p className="text-[12px] text-muted mt-1">{nextRunHint(draft)} {describeSchedule(draft)}</p>
        </header>

        <div>
          <span className="field-label">Dias em que escreve</span>
          <div className="flex gap-1.5 flex-wrap">
            {weekdayLabels().map((label, day) => (
              <button key={day} type="button" className="toggle-chip"
                      aria-pressed={draft.generate_weekdays.includes(day)} onClick={() => toggleDay(day)}>{label}</button>
            ))}
          </div>
          <p className="text-[11.5px] text-muted mt-2">Nenhum dia marcado desliga a escrita automática.</p>
        </div>

        <div className="max-w-[10rem]">
          <label className="field-label" htmlFor="cfg-ghour">Escreve a partir das</label>
          <input id="cfg-ghour" type="number" min={0} max={23} className="field" value={draft.generate_hour}
                 onChange={(e) => set('generate_hour', Number(e.target.value))} />
        </div>

        <div className="pt-4 border-t border-line grid gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={draft.auto_publish} className="mt-1"
                   onChange={(e) => set('auto_publish', e.target.checked)} />
            <span>
              <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Publicar sem revisão</span>
              <span className="block text-[12px] text-muted mt-0.5">O post entra no ar assim que é escrito.</span>
            </span>
          </label>

          <div className={`grid grid-cols-2 gap-4 max-w-sm ${draft.auto_publish ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <label className="field-label" htmlFor="cfg-delay">Publicar depois de (dias)</label>
              <input id="cfg-delay" type="number" min={0} max={60} className="field" value={draft.delay_days}
                     onChange={(e) => set('delay_days', Number(e.target.value))} />
            </div>
            <div>
              <label className="field-label" htmlFor="cfg-hour">Às (hora)</label>
              <input id="cfg-hour" type="number" min={0} max={23} className="field" value={draft.publish_hour}
                     onChange={(e) => set('publish_hour', Number(e.target.value))} />
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted">Fuso: {draft.timezone}</p>
        </div>
      </section>

      <button type="button" disabled={busy} onClick={() => onSave(draft)}
              className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider sticky bottom-3">
        {busy ? 'salvando…' : 'salvar configuração'}
      </button>
    </div>
  )
}
