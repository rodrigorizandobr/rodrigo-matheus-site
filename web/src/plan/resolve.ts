/**
 * Regras puras de quem usa os utilitários (imóveis e previdência) com ou sem conta.
 * Sem React e sem rede: o hook `usePlanSession` só liga isto ao resto.
 */

/** Igualdade por valor. Objetos ignoram a ordem das chaves; listas (as faixas da previdência) não. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k)
    && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export type AfterLogin = 'use-server' | 'save-screen' | 'ask'

/** Por qual botão a pessoa entrou: "salvar com o Google" (guardar o que montou) ou "entrar" (abrir o que já salvou). */
export type LoginIntent = 'save' | 'enter'

/**
 * A pessoa acabou de entrar com o Google. O que fazer com o que está na tela e com o que a conta tem?
 *
 * - conta sem plano, tela intocada: nada a guardar, mostra o padrão do servidor;
 * - conta sem plano, tela mexida: a pessoa clicou em salvar justamente para guardar o que montou;
 * - conta com plano, tela intocada: volta ao plano salvo;
 * - conta com plano, tela mexida: os dois têm valor e gravar um apagaria o outro. Pergunta.
 *
 * Quem entrou por "entrar" já disse o que quer: o plano que salvou. A tela mexida antes do clique era
 * brincadeira com o padrão, não plano de ninguém, então abre o plano salvo sem perguntar.
 */
export function resolveAfterLogin(
  { hasSavedPlan, touched, intent = 'save' }: { hasSavedPlan: boolean; touched: boolean; intent?: LoginIntent },
): AfterLogin {
  if (!touched) return 'use-server'
  if (!hasSavedPlan) return 'save-screen'
  return intent === 'enter' ? 'use-server' : 'ask'
}
