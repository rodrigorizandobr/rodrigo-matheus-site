import { describe, it, expect } from 'vitest'
import { EMAIL_PARTS, assembleEmail, mailtoHref } from './email'

describe('e-mail protegido de coletor de spam', () => {
  it('o endereço não existe inteiro em lugar nenhum do código', () => {
    const fonte = JSON.stringify(EMAIL_PARTS)
    expect(fonte).not.toContain('@')
    expect(fonte.toLowerCase()).not.toContain('rodrigorizando@gmail.com')
  })

  it('montado, é o endereço certo', () => {
    expect(assembleEmail()).toBe('rodrigorizando@gmail.com')
  })

  it('o mailto sai completo, para o clique funcionar', () => {
    expect(mailtoHref()).toBe('mailto:rodrigorizando@gmail.com')
  })

  it('aceita assunto, escapado', () => {
    expect(mailtoHref('Olá & tudo bem?')).toBe('mailto:rodrigorizando@gmail.com?subject=Ol%C3%A1%20%26%20tudo%20bem%3F')
  })
})
