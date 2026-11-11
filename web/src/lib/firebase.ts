import { initializeApp, type FirebaseApp } from 'firebase/app'
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

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getAuthInstance(): Auth {
  if (!auth) {
    app = app ?? initializeApp(config)
    auth = getAuth(app)
  }
  return auth
}

export async function signInWithGoogle(): Promise<User> {
  const instance = getAuthInstance()
  // Sessão sobrevive ao refresh: o painel é usado em várias abas e recargas.
  await setPersistence(instance, browserLocalPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const { user } = await signInWithPopup(instance, provider)
  return user
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
  return user.getIdToken()
}
