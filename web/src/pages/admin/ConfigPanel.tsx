import { useState } from 'react'
import type { BlogConfig } from '../../blog/types'
import { describeSchedule, nextRunHint, weekdayLabels } from '../../blog/editing'

/** Config do robô: quando escrever, e o que fazer com o que escreveu. */
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

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start">
      <div className="panel p-5 md:p-7 grid gap-5">
        <div>
          <h2 className="font-display font-semibold text-heading text-[15px]">Publicação</h2>
          <p className="text-[12px] text-muted mt-1">{describeSchedule(draft)}</p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={draft.auto_publish} className="mt-1"
                 onChange={(e) => set('auto_publish', e.target.checked)} />
          <span>
            <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Publicar automaticamente</span>
            <span className="block text-[12px] text-muted mt-0.5">Sem revisão: o post entra no ar assim que é gerado.</span>
          </span>
        </label>

        <div className={`grid grid-cols-2 gap-4 ${draft.auto_publish ? 'opacity-40 pointer-events-none' : ''}`}>
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

        <div className="pt-4 border-t border-line grid gap-4">
          <div>
            <h2 className="font-display font-semibold text-heading text-[15px]">Geração automática</h2>
            <p className="text-[12px] text-muted mt-1">{nextRunHint(draft)}</p>
          </div>
          <div>
            <span className="field-label">Dias da semana</span>
            <div className="flex gap-1.5 flex-wrap">
              {weekdayLabels().map((label, day) => (
                <button key={day} type="button" className="toggle-chip"
                        aria-pressed={draft.generate_weekdays.includes(day)} onClick={() => toggleDay(day)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="w-32">
            <label className="field-label" htmlFor="cfg-ghour">A partir das (hora)</label>
            <input id="cfg-ghour" type="number" min={0} max={23} className="field" value={draft.generate_hour}
                   onChange={(e) => set('generate_hour', Number(e.target.value))} />
          </div>
          <p className="font-mono text-[11px] text-muted">Fuso: {draft.timezone}</p>
        </div>

        <button type="button" disabled={busy} onClick={() => onSave(draft)}
                className="cta cta-primary !py-3 font-display font-semibold text-[12px] uppercase tracking-wider">
          {busy ? 'salvando…' : 'salvar configuração'}
        </button>
      </div>

      <div className="panel p-5 md:p-7 grid gap-3">
        <div>
          <h2 className="font-display font-semibold text-heading text-[15px]">Pauta</h2>
          <p className="text-[12px] text-muted mt-1">
            Um tema por linha. O robô sorteia um que ainda não virou post — quando a lista acaba, ele para
            em vez de repetir assunto.
          </p>
        </div>
        <textarea className="field !min-h-[22rem] font-mono !text-[12.5px]" value={draft.topics.join('\n')}
                  onChange={(e) => set('topics', e.target.value.split('\n'))} />
        <p className="font-mono text-[11px] text-muted">{draft.topics.filter((t) => t.trim()).length} temas</p>
      </div>
    </div>
  )
}
