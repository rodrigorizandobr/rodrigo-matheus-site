import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompanyBandsField } from './CompanyBandsField'
import type { FaixaEmpresa } from '../../pension/types'

const FAIXAS: FaixaEmpresa[] = [
  { idadeMin: 0, idadeMax: 40, percentual: 100 },
  { idadeMin: 41, idadeMax: 50, percentual: 150 },
]

describe('CompanyBandsField — inserir, editar e apagar faixas', () => {
  it('mostra uma linha por faixa, com os três campos preenchidos', () => {
    render(<CompanyBandsField value={FAIXAS} onChange={() => {}} />)
    expect(screen.getAllByLabelText('De (anos)')).toHaveLength(2)
    expect(screen.getByDisplayValue('41')).toBeInTheDocument()
    expect(screen.getByDisplayValue('150')).toBeInTheDocument()
  })

  it('lista vazia mostra aviso em vez de travar', () => {
    render(<CompanyBandsField value={[]} onChange={() => {}} />)
    expect(screen.getByText(/nenhuma faixa cadastrada/i)).toBeInTheDocument()
  })

  it('adicionar faixa continua a partir do fim da última', () => {
    const onChange = vi.fn()
    render(<CompanyBandsField value={FAIXAS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /adicionar faixa/i }))
    expect(onChange).toHaveBeenCalledWith([...FAIXAS, { idadeMin: 51, idadeMax: 60, percentual: 100 }])
  })

  it('editar um campo muda só aquela faixa, preservando as outras', () => {
    const onChange = vi.fn()
    render(<CompanyBandsField value={FAIXAS} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('150'), { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith([
      FAIXAS[0],
      { idadeMin: 41, idadeMax: 50, percentual: 200 },
    ])
  })

  it('remover tira só a faixa escolhida', () => {
    const onChange = vi.fn()
    render(<CompanyBandsField value={FAIXAS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /remover faixa de 0 a 40/i }))
    expect(onChange).toHaveBeenCalledWith([FAIXAS[1]])
  })
})
