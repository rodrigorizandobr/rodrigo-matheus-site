import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n/useI18n'
import { Preview } from './Tools'
import type { Previa } from './previa'

const fake = (aporte: number, anos: number): Previa => {
  const fim = aporte * anos * 12
  return {
    pontos: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ ano: anos * f, patrimonio: fim * f })),
    patrimonio: fim, imoveis: Math.floor(fim / 300_000), renda: Math.round(fim * 0.004),
  }
}
const r = (engine = fake) => render(<I18nProvider><Preview engine={engine} /></I18nProvider>)

describe('prévia do simulador na home', () => {
  it('mostra o patrimônio, os studios e a renda que o motor devolve', () => {
    r()
    // 4000 x 15 anos x 12 = 720 mil → 2 studios
    expect(screen.getByText('R$ 720K')).toBeInTheDocument()
    expect(screen.getByText(/in 15 years, saving R\$ 4,000 a month/)).toBeInTheDocument()
    expect(screen.getByText(/2 studios/)).toBeInTheDocument()
  })

  it('mexer no aporte refaz a conta', () => {
    r()
    fireEvent.change(screen.getByLabelText(/Monthly savings/), { target: { value: '8000' } })
    expect(screen.getByText('R$ 1.4M')).toBeInTheDocument()
  })

  it('a curva tem um ponto do fio em cada marca do prazo', () => {
    const { container } = r()
    expect(container.querySelectorAll('[data-fio="cp"]')).toHaveLength(5)
    expect(screen.getByText('year 15')).toBeInTheDocument()
  })

  it('quando o dinheiro não paga um studio, diz isso em vez de "0 studios"', () => {
    r(() => ({ pontos: [{ ano: 0, patrimonio: 0 }, { ano: 15, patrimonio: 90_000 }], patrimonio: 90_000, imoveis: 0, renda: 0 }))
    expect(screen.getByText(/Not enough for a whole studio yet/)).toBeInTheDocument()
  })

  it('avisa quem mexeu, para o fio se reacomodar', () => {
    const ouviu = vi.fn()
    window.addEventListener('fio:layout', ouviu)
    r()
    fireEvent.change(screen.getByLabelText(/Term/), { target: { value: '20' } })
    expect(ouviu).toHaveBeenCalled()
    window.removeEventListener('fio:layout', ouviu)
  })
})
