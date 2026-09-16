import { useEffect, useState } from 'react'
import type { BlogConfig, LinkedInStatus, Post } from '../../blog/types'
import { weekdayLabels } from '../../blog/editing'

type Api = {
  status: () => Promise<LinkedInStatus>
  connect: () => Promise<string>
  disconnect: () => Promise<unknown>
  saveApp: (clientId: string, clientSecret: string) => Promise<LinkedInStatus>
  shareNow: () => Promise<Post | null>
}

/**
 * Conexão e agenda do LinkedIn.
 *
 * O token da pessoa dura ~60 dias e o LinkedIn NÃO dá refresh para apps comuns — por
 * isso o painel mostra os dias restantes em destaque: perto do fim é preciso reconectar
 * com um clique, ou o compartilhamento para sem avisar.
 */
export function LinkedInPanel({ config, api, busy, onSave, onMessage }: {
  config: BlogConfig
  api: Api
  busy: boolean
  onSave: (patch: Partial<BlogConfig>) => void
  onMessage: (kind: 'ok' | 'erro', text: string) => void
}) {
  const [status, setStatus] = useState<LinkedInStatus | null>(null)
  const [draft, setDraft] = useState(config)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(null)) }, [api])

  const run = async (fn: () => Promise<void>) => {
    setWorking(true)
    try { await fn() } catch (err) { onMessage('erro', (err as Error).message) } finally { setWorking(false) }
  }

  const toggleDay = (day: number) =>
    setDraft({ ...draft, linkedin_weekdays: draft.linkedin_weekdays.includes(day)
      ? draft.linkedin_weekdays.filter((d) => d !== day)
      : [...draft.linkedin_weekdays, day].sort((a, b) => a - b) })

  const expirando = (status?.daysLeft ?? 99) <= 10

  return (
    <section className="panel p-5 md:p-7 grid gap-5">
      <header>
        <h2 className="font-display font-semibold text-heading text-[15px]">4. LinkedIn</h2>
        <p className="text-[12px] text-muted mt-1 leading-relaxed">
          Compartilha um post por vez no seu perfil, <strong>começando pelos mais antigos</strong>. Cada post vai
          uma vez só, e você pode tirar qualquer um da fila na lista de posts.
        </p>
      </header>

      {status && !status.hasApp && (
        <div className="grid gap-2 max-w-md">
          <span className="field-label !mb-0">Cadastre o app do LinkedIn</span>
          <p className="text-[11.5px] text-muted leading-relaxed">
            Client ID e secret do app em developers.linkedin.com. Ficam guardados no servidor.
          </p>
          <input className="field" placeholder="client id" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <input className="field" type="password" placeholder="client secret" value={clientSecret}
                 onChange={(e) => setClientSecret(e.target.value)} />
          <button type="button" disabled={working || !clientId.trim() || !clientSecret.trim()}
                  className="cta !py-2.5 font-display font-semibold text-[11px] uppercase tracking-wider w-fit"
                  onClick={() => run(async () => {
                    setStatus(await api.saveApp(clientId, clientSecret))
                    setClientId(''); setClientSecret('')
                    onMessage('ok', 'App do LinkedIn cadastrado.')
                  })}>salvar app</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="badge" data-status={status?.connected ? 'published' : undefined}>
          {status?.connected ? 'conectado' : 'desconectado'}
        </span>
        {status?.connected && (
          <span className={`font-mono text-[11px] ${expirando ? 'text-red' : 'text-muted'}`}>
            {expirando ? '⚠ ' : ''}a autorização vence em {status.daysLeft} dias
          </span>
        )}
        {status?.hasApp && !status.connected && (
          <button type="button" disabled={working}
                  className="cta cta-primary !py-2.5 !px-5 font-display font-semibold text-[11px] uppercase tracking-wider"
                  onClick={() => run(async () => { window.location.href = await api.connect() })}>
            conectar conta
          </button>
        )}
        {status?.connected && (
          <>
            <button type="button" disabled={working}
                    className="chip !h-9 font-display font-semibold text-[11px] uppercase tracking-wider"
                    onClick={() => run(async () => { window.location.href = await api.connect() })}>
              reconectar
            </button>
            <button type="button" disabled={working}
                    className="chip !h-9 font-display font-semibold text-[11px] uppercase tracking-wider !text-red"
                    onClick={() => run(async () => { await api.disconnect(); setStatus(await api.status()) })}>
              desconectar
            </button>
          </>
        )}
      </div>

      <div className={`grid gap-5 ${status?.connected ? '' : 'opacity-40 pointer-events-none'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={draft.linkedin_enabled}
                 onChange={(e) => setDraft({ ...draft, linkedin_enabled: e.target.checked })} />
          <span>
            <span className="font-display font-semibold text-[12px] uppercase tracking-wider text-heading">Compartilhar automaticamente</span>
            <span className="block text-[12px] text-muted mt-0.5">Desligado, a fila fica parada e você compartilha quando quiser.</span>
          </span>
        </label>

        <div>
          <span className="field-label">Dias da semana</span>
          <div className="flex gap-1.5 flex-wrap">
            {weekdayLabels().map((label, day) => (
              <button key={day} type="button" className="toggle-chip"
                      aria-pressed={draft.linkedin_weekdays.includes(day)} onClick={() => toggleDay(day)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="max-w-[10rem]">
          <label className="field-label" htmlFor="li-hour">A partir das (hora)</label>
          <input id="li-hour" type="number" min={0} max={23} className="field" value={draft.linkedin_hour}
                 onChange={(e) => setDraft({ ...draft, linkedin_hour: Number(e.target.value) })} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button type="button" disabled={busy}
                  className="cta cta-primary !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider"
                  onClick={() => onSave({
                    linkedin_enabled: draft.linkedin_enabled,
                    linkedin_weekdays: draft.linkedin_weekdays,
                    linkedin_hour: draft.linkedin_hour,
                  })}>
            {busy ? 'salvando…' : 'salvar agenda'}
          </button>
          <button type="button" disabled={working}
                  className="cta !py-3 !px-5 font-display font-semibold text-[12px] uppercase tracking-wider"
                  onClick={() => run(async () => {
                    const post = await api.shareNow()
                    onMessage('ok', post
                      ? `Compartilhado: ${post.i18n?.pt?.title || post.slug}`
                      : 'A fila está vazia — todos os posts habilitados já foram.')
                  })}>
            compartilhar o próximo agora
          </button>
        </div>
      </div>
    </section>
  )
}
