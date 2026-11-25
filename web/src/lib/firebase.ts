import { initializeApp, type FirebaseApp } from 'firebase/app'
import { ReCaptchaEnterpriseProvider, getToken, initializeAppCheck, type AppCheck } from 'firebase/app-check'
import {
  GoogleAuthProvider, browserLocalPersistence, getAuth, onAuthStateChanged,
  setPersistence, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth'

/**
 * Firebase Auth compartilhado por /admin (painel do blog) e /vivendo-de-imoveis
 * (simulador). Estas chaves são PÚBLICAS por desenho — quem protege cada rota é o
 * backend: o painel confere o ID token contra uma allowlist de e-mail
 * (api/blog/auth.py); o simulador aceita qualquer conta autenticada, mas cada uma
 * só enxerga o próprio plano, pelo uid (api/planner/auth.py).
 *
 * O módulo é carregado sob demanda (import() dentro de cada rota): quem só lê o
 * site nunca baixa o SDK do Firebase.
 */
const config = {
  apiKey: 'AIzaSyC90k4Q_ThK6ZX4Up5pmPJjLYkChvh84Dw',
  authDomain: 'rodrigo-matheus.firebaseapp.com',
  projectId: 'rodrigo-matheus',
  storageBucket: 'rodrigo-matheus.firebasestorage.app',
  messagingSenderId: '394784830589',
  appId: '1:394784830589:web:98c642029a8168d5cf2d14',
}

/**
 * Chave de SITE do reCAPTCHA (pública por desenho, como as de cima). É o reCAPTCHA invisível, por
 * pontuação: não existe caixinha para marcar. A chave só funciona nos domínios do site.
 */
const RECAPTCHA_SITE_KEY = '6LfVXScuAAAAANZ25NW4FFEkknpeZdW1qrh4flz_'

/** A mesma frase que o servidor devolve no 403 (`api/guard/web.py`): a pessoa lê igual nos dois casos. */
export const PROOF_FAILED =
  'Não deu para confirmar que este acesso vem do site. Recarregue a página; se continuar, desative o bloqueador de anúncios para este site.'

let app: FirebaseApp | null = null
let appCheck: AppCheck | null = null
let auth: Auth | null = null

/**
 * App Check: o navegador passa pelo reCAPTCHA invisível e recebe uma prova de que a chamada sai
 * DESTE site, num navegador de verdade. A prova vai em toda chamada do painel e dos utilitários
 * (`appCheckToken`), e o próprio login do Firebase a exige. Robô que chama a API direto não a tem.
 *
 * Tem que nascer ANTES do Auth: é assim que o SDK de login passa a mandar a prova sozinho.
 *
 * Em `npm run dev` o reCAPTCHA não roda (localhost não está na chave, de propósito). Para usar o
 * painel de verdade a partir do localhost, registre um token de depuração no console do Firebase
 * (App Check → apps → gerenciar tokens de depuração) e ponha em `web/.env.local`:
 * `VITE_APPCHECK_DEBUG_TOKEN=<token>`. Só vale em modo dev; nunca vai para o build.
 */
function getAppInstance(): FirebaseApp {
  if (!app) {
    app = initializeApp(config)
    if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  }
  return app
}

function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(getAppInstance())
  return auth
}

export async function signInWithGoogle(): Promise<User> {
  const instance = getAuthInstance()
  // Sessão sobrevive ao refresh: o painel é usado em várias abas e recargas.
  await setPersistence(instance, browserLocalPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    const { user } = await signInWithPopup(instance, provider)
    return user
  } catch (err) {
    throw await readable(err)
  }
}

const POPUP_CLOSED = 'Entrada cancelada: a janela do Google foi fechada antes de terminar.'

/**
 * O SDK escreve erro de máquina ("Firebase: Error (auth/internal-error)"), que não diz à pessoa o que fazer.
 * - Janela fechada: foi ela mesma, e a mensagem diz isso.
 * - Prova do navegador recusada (reCAPTCHA bloqueado por extensão, ou nota baixa para este navegador): o login do
 *   Firebase também a exige, e o erro vem como `auth/internal-error`. Só acusamos o reCAPTCHA depois de pedir a
 *   prova e ela de fato falhar; com a prova em ordem, o erro original segue, sem culpar o reCAPTCHA à toa.
 */
async function readable(err: unknown): Promise<Error> {
  const code = (err as { code?: string } | null)?.code
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return new Error(POPUP_CLOSED)
  if (code === 'auth/firebase-app-check-token-is-invalid') return new Error(PROOF_FAILED)
  if (code === 'auth/internal-error') {
    try { await appCheckToken() } catch (proof) { return proof as Error }
  }
  return err instanceof Error ? err : new Error(String(err))
}

export const signOutUser = () => signOut(getAuthInstance())

export function watchUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuthInstance(), cb)
}

/**
 * Token para o header Authorization. Buscado a cada chamada: o ID token expira
 * em uma hora e `getIdToken()` renova sozinho quando necessário.
 */
export async function idToken(): Promise<string> {
  const user = getAuthInstance().currentUser
  if (!user) throw new Error('sessão expirada — entre novamente')
  try {
    return await user.getIdToken()
  } catch (err) {
    throw await readable(err)
  }
}

/**
 * A prova do navegador, para o header X-Firebase-AppCheck. Também buscada a cada chamada: vale uma
 * hora e o SDK devolve a guardada enquanto ela não vence. Se o reCAPTCHA foi bloqueado (extensão,
 * navegador de privacidade), a chamada nem sai: o erro já diz à pessoa o que fazer.
 */
export async function appCheckToken(): Promise<string> {
  getAppInstance()
  try {
    return (await getToken(appCheck as AppCheck, false)).token
  } catch {
    throw new Error(PROOF_FAILED)
  }
}
