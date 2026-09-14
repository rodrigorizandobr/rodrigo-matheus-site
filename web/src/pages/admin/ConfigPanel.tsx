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
          <p className="text-[12px] text-muted mt-1">De onde sai o assunto quando o robô escreve sozinho.</p>
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['news', 'Notícias', 'Parte do que saiu de novo sobre os termos vigiados. Cada post nasce de algo recente.'],
            ['topics', 'Pauta própria', 'Sorteia um tema da sua lista que ainda não virou post.'],
          ] as const).map(([value, titulo, desc]) => (
            <button key={value} type="button" onClick={() => set('auto_source', value)}
                    aria-pressed={draft.auto_source === value}
                    className={`text-left p-3 border transition-colors ${draft.auto_source === value ? 'border-red' : 'border-line hover:border-heading'}`}>
              <span className={`font-display font-semibold text-[12px] uppercase tracking-wider ${draft.auto_source === value ? 'text-red' : 'text-heading'}`}>{titulo}</span>
              <span className="block text-[12px] text-muted mt-1 leading-relaxed">{desc}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="field-label" htmlFor="cfg-news">Termos vigiados — um por linha</label>
          <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
            Assuntos que o robô acompanha para achar notícia. Ele passa por todos em rodízio antes de repetir
            qualquer um.
          </p>
          <textarea id="cfg-news" className="field !min-h-[9rem] font-mono !text-[12.5px]"
                    value={draft.news_terms.join('\n')}
                    onChange={(e) => set('news_terms', e.target.value.split('\n'))} />
          <p className="font-mono text-[11px] text-muted mt-1">{contar(draft.news_terms)} termos</p>
        </div>

        <div>
          <label className="field-label" htmlFor="cfg-topics">Pauta — um tema por linha</label>
          <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
            Sua lista de assuntos próprios, escritos por você. Serve de reserva quando não há termos vigiados, e é a
            origem quando você escolhe "Pauta própria" acima. Tema já usado não se repete: quando a lista acaba, o
            robô para em vez de escrever duas vezes sobre a mesma coisa.
          </p>
          <textarea id="cfg-topics" className="field !min-h-[12rem] font-mono !text-[12.5px]"
                    value={draft.topics.join('\n')}
                    onChange={(e) => set('topics', e.target.value.split('\n'))} />
          <p className="font-mono text-[11px] text-muted mt-1">{contar(draft.topics)} temas</p>
        </div>
      </section>

      <section className="panel p-5 md:p-7 grid gap-4">
        <header>
          <h2 className="font-display font-semibold text-heading text-[15px]">2. Pesquisa na web</h2>
          <p className="text-[12px] text-muted mt-1">
            Antes de escrever, o robô busca no Google e lê as páginas encontradas, usando o material como base.
          </p>
        </header>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={draft.research_enabled} className="mt-1"
                 onChange={(e) => set('research_enabled', e.target.checked)} />
          <span>
            <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Pesquisar antes de escrever</span>
            <span className="block text-[12px] text-muted mt-0.5 leading-relaxed">
              Desligado, o robô escreve só do próprio repertório — mais barato e mais rápido, porém sem nada recente.
              Ao gerar um post na mão você pode decidir caso a caso.
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
