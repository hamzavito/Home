// Ejerens administration af børns login: opret, slå fra, slå til.
// Kun ejere (tjekkes i databasen ud fra den indloggede brugers id).
// Oprettelse: auth-identitet → profil + medlemskab + PIN-hash i én transaktion.
// Fejler databasedelen, slettes auth-identiteten igen, så intet efterlades halvt.
import { isValidName, isValidPin, normalizeUsername, USERNAME_RE } from '../_shared/child-rules.ts'

export type AdminError = 'unauthorized' | 'not_owner' | 'invalid_name' | 'invalid_username' | 'username_taken' | 'invalid_pin' | 'not_found' | 'bad_request' | 'server'

export type AdminDeps = {
  /** Den indloggede brugers id ud fra JWT'en (null = ikke logget ind) */
  callerId: () => Promise<string | null>
  check: (owner: string, username: string) => Promise<string>
  createAuthUser: (email: string, password: string, name: string) => Promise<string>
  deleteAuthUser: (id: string) => Promise<void>
  /** Kaster en fejl med Postgres-kode (fx 23505) ved fejl */
  createAccount: (owner: string, child: string, name: string, username: string, pin: string, pinLength: number) => Promise<void>
  setDisabled: (owner: string, child: string, disabled: boolean) => Promise<void>
  setBanned: (child: string, banned: boolean) => Promise<void>
  randomId: () => string
  randomPassword: () => string
  log?: (msg: string) => void
}

export type AdminResponse = { status: number; body: { ok: true; userId?: string } | { ok: false; error: AdminError } }

const fail = (status: number, error: AdminError): AdminResponse => ({ status, body: { ok: false, error } })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pgError(e: unknown): AdminError {
  const code = (e as { code?: string } | null)?.code
  if (code === '23505') return 'username_taken'
  if (code === '42501') return 'not_owner'
  if (code === 'P0002') return 'not_found'
  if (code === '23514') return 'bad_request'
  return 'server'
}

/** Skjult systemidentitet – vises aldrig i appen */
export const hiddenEmail = (id: string) => `child-${id}@internal.home`

export async function handleAdmin(body: unknown, deps: AdminDeps): Promise<AdminResponse> {
  const owner = await deps.callerId().catch(() => null)
  if (!owner) return fail(401, 'unauthorized')
  const b = (body ?? {}) as Record<string, unknown>

  if (b.action === 'create') {
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const username = typeof b.username === 'string' ? normalizeUsername(b.username) : ''
    const pin = typeof b.pin === 'string' ? b.pin : ''
    const pinLength = b.pinLength === 4 ? 4 : b.pinLength === 6 ? 6 : 0
    if (!isValidName(name)) return fail(400, 'invalid_name')
    if (!USERNAME_RE.test(username)) return fail(400, 'invalid_username')
    if (!isValidPin(pin, pinLength)) return fail(400, 'invalid_pin')

    try {
      const check = await deps.check(owner, username)
      if (check === 'not_owner') return fail(403, 'not_owner')
      if (check === 'username_taken') return fail(409, 'username_taken')
      if (check !== 'ok') return fail(400, 'invalid_username')
    } catch {
      return fail(500, 'server')
    }

    let childId: string
    try {
      childId = await deps.createAuthUser(hiddenEmail(deps.randomId()), deps.randomPassword(), name)
    } catch {
      return fail(500, 'server')
    }
    try {
      await deps.createAccount(owner, childId, name, username, pin, pinLength)
    } catch (e) {
      // Ryd op: ingen forældreløse auth-brugere
      await deps.deleteAuthUser(childId).catch(() => deps.log?.(`oprydning mislykkedes for ${childId}`))
      const err = pgError(e)
      return fail(err === 'username_taken' ? 409 : err === 'not_owner' ? 403 : err === 'server' ? 500 : 400, err)
    }
    return { status: 200, body: { ok: true, userId: childId } }
  }

  if (b.action === 'disable' || b.action === 'enable') {
    const child = typeof b.childId === 'string' && UUID_RE.test(b.childId) ? b.childId : null
    if (!child) return fail(400, 'bad_request')
    const disable = b.action === 'disable'
    try {
      // Databasen først: den lukker adgangen med det samme og tjekker at kalderen er ejer
      await deps.setDisabled(owner, child, disable)
    } catch (e) {
      const err = pgError(e)
      return fail(err === 'not_owner' ? 403 : err === 'not_found' ? 404 : 500, err)
    }
    try {
      await deps.setBanned(child, disable)
    } catch {
      if (!disable) {
        // Kan barnet ikke låses op i Auth, holdes det deaktiveret, så tilstanden er ens
        await deps.setDisabled(owner, child, true).catch(() => {})
        return fail(500, 'server')
      }
      deps.log?.(`kunne ikke spærre auth-bruger ${child} (adgangen er lukket i databasen)`)
    }
    return { status: 200, body: { ok: true } }
  }

  return fail(400, 'bad_request')
}
