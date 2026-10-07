// Barnelogin: husstandskode + brugernavn + PIN → normal Supabase-session.
// Selve kontrollen (PIN-hash, lås, rate limit) sker i databasen (child_login_verify).
// Svaret afslører aldrig, om koden, brugernavnet eller PIN'en var forkert.

export type VerifyResult = { ok: true; user_id: string; email: string } | { ok: false; reason: 'invalid' | 'locked' }
export type SessionTokens = { access_token: string; refresh_token: string; expires_in: number; expires_at?: number }

export type LoginDeps = {
  verify: (code: string, username: string, pin: string, ip: string) => Promise<VerifyResult>
  /** Udsteder en session for den skjulte identitet (kun på serveren) */
  createSession: (email: string) => Promise<SessionTokens>
}

export type LoginResponse =
  | { status: 200; body: { ok: true; session: SessionTokens } }
  | { status: 401 | 429 | 500; body: { ok: false; error: 'invalid' | 'locked' | 'server' } }

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null)

export async function childLogin(body: unknown, ip: string, deps: LoginDeps): Promise<LoginResponse> {
  const b = (body ?? {}) as Record<string, unknown>
  const code = str(b.code, 20)
  const username = str(b.username, 40)
  const pin = str(b.pin, 10)
  // Ugyldige typer/længder kan aldrig være korrekte – samme svar som forkert login
  if (code === null || username === null || pin === null) return { status: 401, body: { ok: false, error: 'invalid' } }
  try {
    const r = await deps.verify(code, username, pin, ip.slice(0, 100))
    if (!r.ok) return r.reason === 'locked' ? { status: 429, body: { ok: false, error: 'locked' } } : { status: 401, body: { ok: false, error: 'invalid' } }
    const session = await deps.createSession(r.email)
    return { status: 200, body: { ok: true, session } }
  } catch {
    return { status: 500, body: { ok: false, error: 'server' } }
  }
}

/** Klientens IP (første adresse i X-Forwarded-For) */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || headers.get('cf-connecting-ip') || headers.get('x-real-ip') || 'ukendt'
}
