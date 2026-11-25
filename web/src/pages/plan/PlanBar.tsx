import type { DefaultsStatus, Mode, SaveState, Session } from './usePlanSession'

/** O que a barra precisa do `usePlanSession`, sem os parâmetros: serve aos dois utilitários. */
export type PlanBarState = {
  session: Session
  saveState: SaveState
  isAdmin: boolean
  mode: Mode
  escolha: boolean
  error: string
  busy: boolean
  padrao: DefaultsStatus
  login: () => void | Promise<void>
  logout: () => void | Promise<void>
  editarPadroes: () => void | Promise<void>
  salvarPadroes: () => void | Promise<void>
  voltarAoPlano: () => void
  usarFabrica: () => void
  manterSalvo: () => void
  usarTela: () => void | Promise<void>
}

/** `disabled:` porque o `.cta` e o `.chip` não mudam de cara quando desligam (medido: opacidade 1): sem isto o botão desligado
 *  parece pronto, e a pessoa só descobre clicando. */
const OFF = 'disabled:opacity-40 disabled:cursor-not-allowed'
const BTN = `chip !h-8 font-display font-semibold text-[11px] uppercase tracking-wider ${OFF}`
const BTN_PRIMARY = `cta cta-primary !py-2 font-display font-semibold text-[11px] uppercase tracking-wider ${OFF}`

/**
 * A faixa do topo dos utilitários: quem está usando, o que acontece com o que a pessoa mexe, e — só para o
 * administrador — a edição dos valores padrão. Os dois utilitários (imóveis e previdência) usam esta mesma.
 */
export function PlanBar({ title, plan }: { title: string; plan: PlanBarState }) {
  const { session, isAdmin, mode } = plan
  const editandoPadrao = isAdmin && mode === 'padrao'

  return (
    <div className="grid gap-4 mb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-display font-bold tracking-[.2em] text-heading text-[13px]">{title}</div>
          {session ? (
            <p className="text-[12px] text-muted mt-1">
              {session.email} · {editandoPadrao ? 'editando os padrões' : statusDoPlano(plan.saveState)}
            </p>
          ) : (
            <p className="text-[12px] text-muted mt-1 max-w-[62ch]">
              Valores de exemplo: nada do que você mexer é salvo. Entre com o Google para guardar o seu plano e continuar depois.
            </p>
          )}
        </div>
        {session ? (
          <button type="button" onClick={() => plan.logout()} className={BTN}>sair</button>
        ) : (
          <button type="button" onClick={() => plan.login()} disabled={plan.busy} className={BTN_PRIMARY}>
            {plan.busy ? 'abrindo…' : 'salvar com o Google'}
          </button>
        )}
      </div>

      {plan.error && <p role="alert" className="text-[12px] text-red">{plan.error}</p>}

      {plan.escolha && (
        <div className="panel hud-frame p-4 grid gap-3">
          <p className="text-[13px] text-heading">
            Você já tem um plano salvo nesta conta. Usar o que está na tela substitui o plano salvo.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => plan.manterSalvo()} className={BTN}>manter o plano salvo</button>
            <button type="button" onClick={() => plan.usarTela()} className={BTN}>usar o que está na tela</button>
          </div>
        </div>
      )}

      {isAdmin && !editandoPadrao && (
        <div className="panel hud-frame p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-muted max-w-[62ch]">
            <span className="hud-label mr-2">administrador</span>
            Você vê o seu plano pessoal. Os valores que os visitantes veem ao abrir a página são outros.
          </p>
          <button type="button" onClick={() => plan.editarPadroes()} className={BTN}>editar padrões dos visitantes</button>
        </div>
      )}

      {editandoPadrao && (
        <div className="panel hud-frame p-4 grid gap-3 border border-red">
          <p className="text-[13px] text-heading">
            <span className="hud-label mr-2">padrão dos visitantes</span>
            Você está editando o que todo visitante vê ao abrir esta página. O seu plano pessoal não é alterado.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => plan.salvarPadroes()}
                    disabled={plan.padrao.state === 'salvando' || !plan.padrao.sujo}
                    className={BTN_PRIMARY}>salvar como padrão</button>
            <button type="button" onClick={() => plan.usarFabrica()} className={BTN}>valores de fábrica</button>
            <button type="button" onClick={() => plan.voltarAoPlano()} className={BTN}>voltar ao meu plano</button>
          </div>
          <p className="text-[12px] text-muted">{statusDoPadrao(plan.padrao)}</p>
        </div>
      )}
    </div>
  )
}

function statusDoPlano(estado: SaveState): string {
  if (estado === 'salvando') return 'salvando…'
  if (estado === 'erro') return 'erro ao salvar'
  if (estado === 'salvo') return 'salvo'
  return ' '
}

function statusDoPadrao({ state, sujo }: DefaultsStatus): string {
  if (state === 'erro') return 'erro ao salvar o padrão'
  if (state === 'salvando') return 'salvando…'
  if (sujo) return 'alterações não salvas'
  if (state === 'salvo') return 'Padrão salvo. Os visitantes veem em até 1 minuto.'
  return ' '
}
