import { describe, it, expect } from 'vitest'
import { assembleEmail } from './email'
import { PHONE_PARTS, assemblePhone, telHref, whatsappHref } from './phone'

describe('telefone fora do alcance de robô', () => {
  it('nenhum pedaço guardado é um telefone reconhecível', () => {
    const cru = JSON.stringify(PHONE_PARTS)
    expect(cru).not.toMatch(/\+55/)
    expect(cru).not.toMatch(/9418/)
  })

  it('montado no navegador vira o número do currículo', () => {
    expect(assemblePhone()).toBe('+55 11 94180-0766')
  })

  it('o link de ligação usa só dígitos, como o padrão tel: pede', () => {
    expect(telHref()).toBe('tel:+5511941800766')
  })

  it('o link de WhatsApp leva o número sem sinais', () => {
    expect(whatsappHref()).toBe('https://wa.me/5511941800766')
  })

  it('o e-mail continua montado do mesmo jeito', () => {
    expect(assembleEmail()).toBe('rodrigorizando@gmail.com')
  })
})
