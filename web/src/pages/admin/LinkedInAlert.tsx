import type { LinkedInStatus } from '../../blog/types'

/**
 * Faixa de aviso da autorização do LinkedIn, visível em TODAS as abas do painel.
 *
 * O painel de configuração já mostra o prazo, mas ninguém abre configuração para
 * conferir que está tudo bem — e a autorização morre em silêncio. Esta faixa é a
 * ponta visível da mesma régua que manda e-mail (`api/blog/notify.py`).
 */
export function LinkedInAlert({ status, sharingEnabled, onReconnect }: {
  status: LinkedInStatus | null
  sharingEnabled: boolean
  onReconnect: () => void
}) {
  if (!status) return null

  if (!status.connected) {
    if (!sharingEnabled) return null
    return (
      <Faixa level="danger" onReconnect={onReconnect} acao="conectar">
        O compartilhamento automático está ligado, mas não há conta do LinkedIn conectada —
        nenhum post está indo para lá.
      </Faixa>
    )
  }

  const dias = status.daysLeft ?? 99
  if (dias > 15) return null

  if (dias < 0) {
    return (
      <Faixa level="danger" onReconnect={onReconnect} acao="reconectar">
        A autorização do LinkedIn venceu e o compartilhamento parou. A fila não se perdeu:
        ela continua do post mais antigo assim que você reconectar.
      </Faixa>
    )
  }

  const prazo = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence em 1 dia' : `vence em ${dias} dias`
  return (
    <Faixa level={dias <= 7 ? 'danger' : 'warn'} onReconnect={onReconnect} acao="reconectar">
      A autorização do LinkedIn {prazo} e não se renova sozinha. Quando vencer, o
      compartilhamento para sem aviso na tela.
    </Faixa>
  )
}

function Faixa({ level, acao, onReconnect, children }: {
  level: 'warn' | 'danger'
  acao: string
  onReconnect: () => void
  children: React.ReactNode
}) {
  return (
    <div role="status" data-level={level}
         className="panel px-4 py-3 flex items-center gap-3 flex-wrap border-l-2"
         style={{ borderLeftColor: level === 'danger' ? 'var(--red)' : 'var(--muted)' }}>
      <p className="text-[12.5px] leading-relaxed flex-1 min-w-[16rem]">
        <span className={`font-display font-semibold uppercase tracking-wider text-[11px] mr-2 ${level === 'danger' ? 'text-red' : 'text-heading'}`}>
          LinkedIn
        </span>
        {children}
      </p>
      <button type="button" onClick={onReconnect}
              className="cta cta-primary !py-2 !px-4 font-display font-semibold text-[11px] uppercase tracking-wider">
        {acao}
      </button>
    </div>
  )
}
