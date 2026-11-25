/**
 * Lembrete de que alguém já entrou com o Google NESTE navegador.
 *
 * Quem só quer brincar com um utilitário não entra, então a página nem carrega o Firebase nem o
 * reCAPTCHA (cada abertura gastaria uma verificação da cota e baixaria o SDK à toa). Só carrega
 * quando a pessoa clica em salvar, ou quando este lembrete diz que ela já entrou antes e o plano
 * dela precisa voltar. O lembrete guarda só "alguém entrou", nunca quem: a sessão de verdade é do
 * Firebase, e a conta é conferida pelo servidor a cada chamada.
 *
 * Sem armazenamento (janela privada, dados bloqueados) nada estoura: o lembrete só fica desligado, e a
 * pessoa volta a entrar clicando em salvar.
 */
const KEY = 'rm:entrou'

export function wasSignedIn(): boolean {
  try { return window.localStorage.getItem(KEY) === '1' } catch { return false }
}

export function rememberSignedIn(): void {
  try { window.localStorage.setItem(KEY, '1') } catch { /* sem armazenamento */ }
}

export function forgetSignedIn(): void {
  try { window.localStorage.removeItem(KEY) } catch { /* sem armazenamento */ }
}
