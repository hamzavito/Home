import { describe, expect, it, vi } from 'vitest'
import { isValidPin, normalizeCode, normalizeUsername } from '../_shared/child-rules'
import { handleAdmin, hiddenEmail, type AdminDeps } from './admin'

const OWNER = '00000000-0000-4000-8000-0000000000a1'
const CHILD = '00000000-0000-4000-8000-0000000000b1'

function deps(over: Partial<AdminDeps> = {}) {
  const d = {
    callerId: vi.fn(async () => OWNER as string | null),
    check: vi.fn(async () => 'ok'),
    createAuthUser: vi.fn(async () => CHILD),
    deleteAuthUser: vi.fn(async () => {}),
    createAccount: vi.fn(async () => {}),
    setDisabled: vi.fn(async () => {}),
    setBanned: vi.fn(async () => {}),
    createProfile: vi.fn(async () => {}),
    addLogin: vi.fn(async () => {}),
    deleteChild: vi.fn(async () => {}),
    deleteUser: vi.fn(async () => {}),
    randomId: () => 'rnd',
    randomPassword: () => 'pw-hemmelig',
    ...over,
  }
  return d
}
const create = { action: 'create', name: ' Noah ', username: ' Noah ', pin: '482611', pinLength: 6 }

describe('opret barn', () => {
  it('opretter skjult identitet og konto', async () => {
    const d = deps()
    const r = await handleAdmin(create, d)
    expect(r).toEqual({ status: 200, body: { ok: true, userId: CHILD } })
    expect(d.createAuthUser).toHaveBeenCalledWith('child-rnd@internal.home', 'pw-hemmelig', 'Noah')
    expect(d.createAccount).toHaveBeenCalledWith(OWNER, CHILD, 'Noah', 'noah', '482611', 6)
    expect(hiddenEmail('x')).toBe('child-x@internal.home')
  })

  it('kræver login', async () => {
    const d = deps({ callerId: vi.fn(async () => null) })
    expect((await handleAdmin(create, d)).status).toBe(401)
    expect(d.createAuthUser).not.toHaveBeenCalled()
  })

  it('ikke-ejere (adult/child) afvises før der oprettes noget', async () => {
    const d = deps({ check: vi.fn(async () => 'not_owner') })
    expect(await handleAdmin(create, d)).toEqual({ status: 403, body: { ok: false, error: 'not_owner' } })
    expect(d.createAuthUser).not.toHaveBeenCalled()
  })

  it('optaget brugernavn afvises', async () => {
    const d = deps({ check: vi.fn(async () => 'username_taken') })
    expect((await handleAdmin(create, d)).body).toEqual({ ok: false, error: 'username_taken' })
    expect(d.createAuthUser).not.toHaveBeenCalled()
  })

  it('fejler databasen, slettes auth-brugeren igen', async () => {
    const d = deps({ createAccount: vi.fn(async () => { throw { code: '23505' } }) })
    expect(await handleAdmin(create, d)).toEqual({ status: 409, body: { ok: false, error: 'username_taken' } })
    expect(d.deleteAuthUser).toHaveBeenCalledWith(CHILD)
  })

  it('ugyldige input afvises før noget oprettes', async () => {
    const d = deps()
    expect((await handleAdmin({ ...create, name: '  ' }, d)).body).toEqual({ ok: false, error: 'invalid_name' })
    expect((await handleAdmin({ ...create, username: 'n' }, d)).body).toEqual({ ok: false, error: 'invalid_username' })
    expect((await handleAdmin({ ...create, pin: '12a456' }, d)).body).toEqual({ ok: false, error: 'invalid_pin' })
    expect((await handleAdmin({ ...create, pin: '4826', pinLength: 6 }, d)).body).toEqual({ ok: false, error: 'invalid_pin' })
    expect((await handleAdmin({ ...create, pinLength: 5 }, d)).body).toEqual({ ok: false, error: 'invalid_pin' })
    expect(d.check).not.toHaveBeenCalled()
  })
})

describe('slå login fra og til', () => {
  it('slår fra i databasen og spærrer i Auth', async () => {
    const d = deps()
    expect((await handleAdmin({ action: 'disable', childId: CHILD }, d)).status).toBe(200)
    expect(d.setDisabled).toHaveBeenCalledWith(OWNER, CHILD, true)
    expect(d.setBanned).toHaveBeenCalledWith(CHILD, true)
  })

  it('ikke-ejer afvises, og Auth røres ikke', async () => {
    const d = deps({ setDisabled: vi.fn(async () => { throw { code: '42501' } }) })
    expect((await handleAdmin({ action: 'enable', childId: CHILD }, d)).status).toBe(403)
    expect(d.setBanned).not.toHaveBeenCalled()
  })

  it('kan barnet ikke låses op i Auth, forbliver det deaktiveret', async () => {
    const d = deps({ setBanned: vi.fn(async () => { throw new Error('x') }) })
    expect((await handleAdmin({ action: 'enable', childId: CHILD }, d)).status).toBe(500)
    expect(d.setDisabled).toHaveBeenLastCalledWith(OWNER, CHILD, true)
  })

  it('ugyldigt id afvises', async () => {
    expect((await handleAdmin({ action: 'disable', childId: 'x' }, deps())).status).toBe(400)
    expect((await handleAdmin({ action: 'slet' }, deps())).status).toBe(400)
  })
})

describe('regler', () => {
  it('PIN', () => {
    expect(isValidPin('482611', 6)).toBe(true)
    expect(isValidPin('7395', 4)).toBe(true)
    // Lette PIN'er er tilladt
    for (const p of ['123456', '000000', '1234', '7777']) expect(isValidPin(p, p.length)).toBe(true)
    for (const p of ['48261a', '12345', '']) expect(isValidPin(p, 6)).toBe(false)
    expect(isValidPin('482611', 4)).toBe(false)
  })
  it('normalisering', () => {
    expect(normalizeCode(' vh jm42 ')).toBe('VHJM42')
    expect(normalizeUsername(' Noah ')).toBe('noah')
  })
})

describe('barn uden login', () => {
  it('opretter spærret identitet og profil uden brugernavn/PIN', async () => {
    const d = deps()
    const r = await handleAdmin({ action: 'create', login: false, name: ' Ella ', wallet: false }, d)
    expect(r).toEqual({ status: 200, body: { ok: true, userId: CHILD } })
    expect(d.setBanned).toHaveBeenCalledWith(CHILD, true)
    expect(d.createProfile).toHaveBeenCalledWith(OWNER, CHILD, 'Ella', false)
    expect(d.createAccount).not.toHaveBeenCalled()
    expect(d.check).not.toHaveBeenCalled()
  })

  it('rydder op, hvis databasen afviser', async () => {
    const d = deps({ createProfile: vi.fn(async () => Promise.reject({ code: '42501' })) })
    expect(await handleAdmin({ action: 'create', login: false, name: 'Ella' }, d)).toEqual({ status: 403, body: { ok: false, error: 'not_owner' } })
    expect(d.deleteAuthUser).toHaveBeenCalledWith(CHILD)
  })

  it('kræver navn', async () => {
    expect((await handleAdmin({ action: 'create', login: false, name: ' ' }, deps())).body).toEqual({ ok: false, error: 'invalid_name' })
  })

  it('giv login senere: låser op og gemmer brugernavn + PIN', async () => {
    const d = deps()
    const r = await handleAdmin({ action: 'add-login', childId: CHILD, username: 'Ella', pin: '4826', pinLength: 4 }, d)
    expect(r).toEqual({ status: 200, body: { ok: true } })
    expect(d.check).toHaveBeenCalledWith(OWNER, 'ella')
    expect(d.setBanned).toHaveBeenCalledWith(CHILD, false)
    expect(d.addLogin).toHaveBeenCalledWith(OWNER, CHILD, 'ella', '4826', 4)
  })

  it('giv login: optaget brugernavn og fejl i databasen spærrer igen', async () => {
    expect((await handleAdmin({ action: 'add-login', childId: CHILD, username: 'ella', pin: '4826', pinLength: 4 }, deps({ check: vi.fn(async () => 'username_taken') }))).status).toBe(409)
    const d = deps({ addLogin: vi.fn(async () => Promise.reject({ code: 'P0002' })) })
    expect((await handleAdmin({ action: 'add-login', childId: CHILD, username: 'ella', pin: '4826', pinLength: 4 }, d)).status).toBe(404)
    expect(d.setBanned).toHaveBeenLastCalledWith(CHILD, true)
  })
})

describe('slet barn', () => {
  it('kræver bekræftelse', async () => {
    const d = deps()
    expect((await handleAdmin({ action: 'delete', childId: CHILD }, d)).status).toBe(400)
    expect(d.deleteChild).not.toHaveBeenCalled()
  })

  it('sletter data og derefter login-identiteten', async () => {
    const d = deps()
    expect(await handleAdmin({ action: 'delete', childId: CHILD, confirm: 'SLET' }, d)).toEqual({ status: 200, body: { ok: true } })
    expect(d.deleteChild).toHaveBeenCalledWith(OWNER, CHILD)
    expect(d.deleteUser).toHaveBeenCalledWith(CHILD, false)
  })

  it('blød sletning, hvis historik peger på barnet', async () => {
    const d = deps({ deleteUser: vi.fn(async (_id: string, soft: boolean) => (soft ? undefined : Promise.reject(new Error('fk')))) })
    expect((await handleAdmin({ action: 'delete', childId: CHILD, confirm: 'SLET' }, d)).status).toBe(200)
    expect(d.deleteUser).toHaveBeenLastCalledWith(CHILD, true)
  })

  it('kun ejere', async () => {
    const d = deps({ deleteChild: vi.fn(async () => Promise.reject({ code: '42501' })) })
    expect(await handleAdmin({ action: 'delete', childId: CHILD, confirm: 'SLET' }, d)).toEqual({ status: 403, body: { ok: false, error: 'not_owner' } })
    expect(d.deleteUser).not.toHaveBeenCalled()
  })
})
