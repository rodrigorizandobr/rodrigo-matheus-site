import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Os erros do login e da prova do navegador chegam à tela como o SDK os escreve ("Firebase: Error
 * (auth/internal-error)"), que não diz à pessoa o que fazer. Aqui se confere a tradução, com o SDK trocado por
 * um de mentira.
 */
const sdk = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  getToken: vi.fn(),
  getIdToken: vi.fn(),
  currentUser: null as null | { getIdToken: () => Promise<string> },
}))

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }))
vi.mock('firebase/app-check', () => ({
  ReCaptchaEnterpriseProvider: class {},
  initializeAppCheck: vi.fn(() => ({})),
  getToken: (...args: unknown[]) => sdk.getToken(...args),
}))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class { setCustomParameters() {} },
  browserLocalPersistence: {},
  getAuth: vi.fn(() => ({ get currentUser() { return sdk.currentUser } })),
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(async () => {}),
  signInWithPopup: (...args: unknown[]) => sdk.signInWithPopup(...args),
  signOut: vi.fn(),
}))

const erro = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code })
const carregar = async () => { vi.resetModules(); return import('./firebase') }

beforeEach(() => {
  sdk.signInWithPopup.mockReset(); sdk.getToken.mockReset(); sdk.getIdToken.mockReset()
  sdk.currentUser = { getIdToken: () => sdk.getIdToken() }
  sdk.getToken.mockResolvedValue({ token: 'prova-do-navegador' })
})

describe('entrar com o Google', () => {
  it('devolve a conta quando o Google aceita', async () => {
    sdk.signInWithPopup.mockResolvedValue({ user: { email: 'eu@example.com' } })
    const { signInWithGoogle } = await carregar()
    await expect(signInWithGoogle()).resolves.toMatchObject({ email: 'eu@example.com' })
  })

  it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])('%s: diz que a janela foi fechada, sem código técnico', async (code) => {
    sdk.signInWithPopup.mockRejectedValue(erro(code))
    const { signInWithGoogle } = await carregar()
    const falha = await signInWithGoogle().catch((e: Error) => e)
    expect(falha).toBeInstanceOf(Error)
    expect((falha as Error).message).toMatch(/janela do Google/i)
    expect((falha as Error).message).not.toMatch(/auth\//)
  })

  it('erro interno com a prova do navegador FALHANDO: a causa é o reCAPTCHA bloqueado, e a mensagem diz o que fazer', async () => {
    sdk.signInWithPopup.mockRejectedValue(erro('auth/internal-error'))
    sdk.getToken.mockRejectedValue(new Error('App attestation failed'))
    const { signInWithGoogle, PROOF_FAILED } = await carregar()
    const falha = await signInWithGoogle().catch((e: Error) => e)
    expect((falha as Error).message).toBe(PROOF_FAILED)
    expect(PROOF_FAILED).toMatch(/Recarregue/)
    expect(PROOF_FAILED).toMatch(/bloqueador/)
  })

  it('erro interno com a prova do navegador FUNCIONANDO: não acusa o reCAPTCHA sem motivo, devolve o erro original', async () => {
    const original = erro('auth/internal-error')
    sdk.signInWithPopup.mockRejectedValue(original)
    const { signInWithGoogle } = await carregar()
    await expect(signInWithGoogle()).rejects.toBe(original)
  })

  it('o código antigo de prova inválida também vira a mensagem do reCAPTCHA', async () => {
    sdk.signInWithPopup.mockRejectedValue(erro('auth/firebase-app-check-token-is-invalid'))
    const { signInWithGoogle, PROOF_FAILED } = await carregar()
    await expect(signInWithGoogle()).rejects.toThrow(PROOF_FAILED)
  })
})

describe('a prova do navegador', () => {
  it('devolve o token quando o reCAPTCHA aprova', async () => {
    const { appCheckToken } = await carregar()
    await expect(appCheckToken()).resolves.toBe('prova-do-navegador')
  })

  it('reCAPTCHA bloqueado ou nota baixa: a chamada nem sai, e a mensagem diz o que fazer', async () => {
    sdk.getToken.mockRejectedValue(new Error('App attestation failed'))
    const { appCheckToken, PROOF_FAILED } = await carregar()
    await expect(appCheckToken()).rejects.toThrow(PROOF_FAILED)
  })
})

describe('o token de login', () => {
  it('sem sessão: pede para entrar de novo', async () => {
    sdk.currentUser = null
    const { idToken } = await carregar()
    await expect(idToken()).rejects.toThrow(/entre novamente/)
  })

  it('devolve o token da conta', async () => {
    sdk.getIdToken.mockResolvedValue('jwt-1')
    const { idToken } = await carregar()
    await expect(idToken()).resolves.toBe('jwt-1')
  })

  it('renovar o token sem a prova do navegador vira a mensagem do reCAPTCHA', async () => {
    sdk.getIdToken.mockRejectedValue(erro('auth/firebase-app-check-token-is-invalid'))
    const { idToken, PROOF_FAILED } = await carregar()
    await expect(idToken()).rejects.toThrow(PROOF_FAILED)
  })
})
