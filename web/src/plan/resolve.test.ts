import { describe, it, expect } from 'vitest'
import { deepEqual, resolveAfterLogin } from './resolve'

describe('deepEqual', () => {
  it('objetos iguais são iguais, mesmo com as chaves em outra ordem', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })
  it('um valor diferente basta para serem diferentes', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
  })
  it('número não é igual ao mesmo número escrito como texto', () => {
    expect(deepEqual({ a: 1 }, { a: '1' })).toBe(false)
  })
  it('compara listas de objetos (as faixas da previdência) pela ordem e pelo conteúdo', () => {
    const faixas = [{ idadeMin: 0, idadeMax: 40, percentual: 100 }, { idadeMin: 41, idadeMax: 120, percentual: 150 }]
    expect(deepEqual({ faixas }, { faixas: faixas.map((f) => ({ ...f })) })).toBe(true)
    expect(deepEqual({ faixas }, { faixas: [...faixas].reverse() })).toBe(false)
    expect(deepEqual({ faixas }, { faixas: faixas.slice(0, 1) })).toBe(false)
  })
  it('chave a mais ou a menos é diferença', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
  })
})

describe('resolveAfterLogin: o que fazer quando a pessoa entra com o Google', () => {
  it('conta sem plano e tela intocada: mostra o padrão e não grava nada', () => {
    expect(resolveAfterLogin({ hasSavedPlan: false, touched: false })).toBe('use-server')
  })
  it('conta sem plano e tela mexida: guarda o que a pessoa montou (era isso que ela queria salvar)', () => {
    expect(resolveAfterLogin({ hasSavedPlan: false, touched: true })).toBe('save-screen')
  })
  it('conta com plano e tela intocada: volta ao plano salvo', () => {
    expect(resolveAfterLogin({ hasSavedPlan: true, touched: false })).toBe('use-server')
  })
  it('conta com plano e tela mexida: pergunta, porque os dois têm valor e um apagaria o outro', () => {
    expect(resolveAfterLogin({ hasSavedPlan: true, touched: true })).toBe('ask')
  })
})
