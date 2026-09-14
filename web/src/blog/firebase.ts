import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider, browserLocalPersistence, getAuth, onAuthStateChanged,
  setPersistence, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth'

/**
 * Firebase só para o painel. Estas chaves são PÚBLICAS por desenho — quem
 * protege o blog é a allowlist de e-mail no backend (api/blog/auth.py), que
 * confere o ID token contra as chaves públicas do Google. Sem isso, qualquer
 * conta Google logaria e não conseguiria fazer nada.
 *
 * O módulo é carregado sob demanda (import() dentro da rota /admin): o visitante
 * do site não baixa o SDK do Firebase.
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

export const signOutAdmin = () => signOut(getAuthInstance())

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
