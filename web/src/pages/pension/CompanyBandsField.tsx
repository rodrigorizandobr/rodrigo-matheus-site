import type { FaixaEmpresa } from '../../pension/types'

const MAX_FAIXAS = 20

/**
 * Lista editável de faixas de contrapartida da empresa por idade — inserir, editar e
 * apagar livremente (pedido do PO: "no caso do Digio, até 40 anos eles pagam 100%...").
 * Não é slider: é uma lista de tamanho variável, então cada linha é um conjunto de
 * campos numéricos pequenos + botão de remover, com um botão de adicionar no fim.
 */
export function CompanyBandsField({ value, onChange }: {
  value: FaixaEmpresa[]
  onChange: (value: FaixaEmpresa[]) => void
}) {
  const atualizar = (i: number, patch: Partial<FaixaEmpresa>) => {
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  const remover = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const adicionar = () => {
    const ultima = value.at(-1)
    onChange([...value, {
      idadeMin: ultima ? ultima.idadeMax + 1 : 0,
      idadeMax: ultima ? ultima.idadeMax + 10 : 40,
      percentual: 100,
    }])
  }

  return (
    <div className="grid gap-2">
      <span className="text-[12px] text-muted">Faixas de contrapartida da empresa, por idade</span>
      {value.length === 0 && (
        <p className="text-[11px] text-muted">Nenhuma faixa cadastrada — a empresa não aporta nada.</p>
      )}
      <div className="grid gap-2">
        {value.map((faixa, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-end">
            <Campo label="De (anos)" value={faixa.idadeMin}
                   onChange={(v) => atualizar(i, { idadeMin: v })} />
            <Campo label="Até (anos)" value={faixa.idadeMax}
                   onChange={(v) => atualizar(i, { idadeMax: v })} />
            <Campo label="Empresa (%)" value={faixa.percentual} step={10}
                   onChange={(v) => atualizar(i, { percentual: v })} />
            <button type="button" onClick={() => remover(i)}
                    aria-label={`Remover faixa de ${faixa.idadeMin} a ${faixa.idadeMax} anos`}
                    className="chip !h-9 !w-9 !px-0 justify-center text-red shrink-0">✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={adicionar} disabled={value.length >= MAX_FAIXAS}
              className="chip !h-9 justify-center font-display font-semibold text-[11px] uppercase tracking-wider">
        + adicionar faixa
      </button>
    </div>
  )
}

function Campo({ label, value, onChange, step = 1 }: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] text-muted">{label}</span>
      <input type="number" step={step} value={value}
             onChange={(e) => {
               const n = Number(e.target.value)
               if (!Number.isNaN(n)) onChange(n)
             }}
             className="field !w-auto tabular-nums" />
    </label>
  )
}
