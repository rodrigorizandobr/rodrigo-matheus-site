import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A política de segurança do site (CSP, em firebase.json) precisa liberar o reCAPTCHA e a troca da
 * prova do App Check. Se faltar um destes endereços o navegador bloqueia em silêncio, a prova não
 * sai, e o servidor recusa TODA chamada do painel e dos utilitários — sem nenhum teste de tela acusar.
 */
type Header = { key: string; value: string }
const hosting = JSON.parse(readFileSync('../firebase.json', 'utf8')).hosting
const csp: string = hosting.headers
  .flatMap((bloco: { headers: Header[] }) => bloco.headers)
  .find((h: Header) => h.key === 'Content-Security-Policy').value

const diretiva = (nome: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${nome} `))?.split(/\s+/).slice(1) ?? []

describe('a política de segurança libera a prova do navegador', () => {
  it('o script do reCAPTCHA pode carregar', () => {
    expect(diretiva('script-src')).toEqual(expect.arrayContaining([
      'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/',
    ]))
  })

  it('a moldura invisível do reCAPTCHA pode abrir', () => {
    expect(diretiva('frame-src')).toEqual(expect.arrayContaining([
      'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/',
    ]))
  })

  it('o navegador pode trocar o resultado do reCAPTCHA pela prova do App Check', () => {
    expect(diretiva('connect-src')).toEqual(expect.arrayContaining([
      'https://content-firebaseappcheck.googleapis.com', 'https://www.google.com/recaptcha/',
    ]))
  })

  it('o login do Google continua liberado', () => {
    expect(diretiva('connect-src')).toEqual(expect.arrayContaining([
      'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com',
    ]))
    expect(diretiva('frame-src')).toEqual(expect.arrayContaining(['https://rodrigo-matheus.firebaseapp.com']))
  })
})
