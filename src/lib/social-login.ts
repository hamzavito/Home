// "Log ind med Apple" og "Log ind med Google" uden at forlade appen.
//
// Et almindeligt OAuth-redirect fra en PWA på hjemmeskærmen ender i Safari – og
// sessionen dermed i Safari i stedet for i appen. Derfor bruges Apples og Googles
// egne JavaScript-biblioteker, der giver et ID-token direkte tilbage til siden.
// Tokenet veksles hos Supabase (signInWithIdToken), som selv kontrollerer det.
//
// Nonce: Apple/Google får SHA-256 af en tilfældig værdi; Supabase får den rå værdi
// og tjekker, at de passer sammen (beskytter mod genbrug af et opsnappet token).
import { env } from './env'

export const appleEnabled = () => Boolean(env.appleServicesId)
export const googleEnabled = () => Boolean(env.googleClientId)

export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}

const scripts = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scripts.delete(src)
        reject(new Error('Kunne ikke hente login-siden. Tjek forbindelsen.'))
      }
      document.head.append(s)
    })
    scripts.set(src, p)
  }
  return p
}

export type IdTokenResult = { token: string; nonce: string; name: string | null }

// ---------------------------------------------------------------- Apple
type AppleSignInResponse = {
  authorization: { id_token: string }
  user?: { name?: { firstName?: string; lastName?: string } }
}
type AppleIdApi = {
  auth: {
    init: (cfg: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; nonce: string; state?: string }) => void
    signIn: () => Promise<AppleSignInResponse>
  }
}

export async function appleIdToken(): Promise<IdTokenResult> {
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/da_DK/appleid.auth.js')
  const AppleID = (window as unknown as { AppleID?: AppleIdApi }).AppleID
  if (!AppleID) throw new Error('Kunne ikke hente login-siden. Tjek forbindelsen.')
  const nonce = await createNonce()
  AppleID.auth.init({ clientId: env.appleServicesId, scope: 'name email', redirectURI: `${window.location.origin}/login`, usePopup: true, nonce: nonce.hashed })
  const res = await AppleID.auth.signIn()
  // Apple sender kun navnet første gang, man logger ind
  const n = res.user?.name
  const name = [n?.firstName, n?.lastName].filter(Boolean).join(' ').trim() || null
  return { token: res.authorization.id_token, nonce: nonce.raw, name }
}

/** Apple-popup lukket af brugeren – ikke en fejl, der skal vises */
export const isCancelled = (e: unknown) => /popup_closed_by_user|user_cancelled_authorize|user_trigger_new_signin_flow|cancel/i.test(String((e as { error?: string })?.error ?? (e as Error)?.message ?? e))

// ---------------------------------------------------------------- Google
type GoogleIdApi = {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; nonce: string; use_fedcm_for_prompt?: boolean; ux_mode?: 'popup' }) => void
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
    }
  }
}

/**
 * Googles egen knap (krav fra Google). onToken kaldes, når brugeren har valgt konto.
 * Returnerer den rå nonce, der skal sendes til Supabase sammen med tokenet.
 */
export async function renderGoogleButton(el: HTMLElement, width: number, onToken: (r: IdTokenResult) => void): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client')
  const google = (window as unknown as { google?: GoogleIdApi }).google
  if (!google) throw new Error('Kunne ikke hente login-siden. Tjek forbindelsen.')
  const nonce = await createNonce()
  google.accounts.id.initialize({
    client_id: env.googleClientId,
    nonce: nonce.hashed,
    ux_mode: 'popup',
    callback: (r) => onToken({ token: r.credential, nonce: nonce.raw, name: null }),
  })
  el.replaceChildren()
  google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'da', width })
}
