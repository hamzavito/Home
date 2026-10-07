import { describe, expect, it, vi } from 'vitest'
import { childLogin, clientIp, type LoginDeps } from './login'

const tokens = { access_token: 'a', refresh_token: 'r', expires_in: 3600 }

function deps(result: Awaited<ReturnType<LoginDeps['verify']>>): LoginDeps & { verify: ReturnType<typeof vi.fn>; createSession: ReturnType<typeof vi.fn> } {
  return { verify: vi.fn(async () => result), createSession: vi.fn(async () => tokens) }
}

describe('barnelogin', () => {
  it('korrekt login giver en session for den skjulte identitet', async () => {
    const d = deps({ ok: true, user_id: 'u1', email: 'child-x@internal.home' })
    const r = await childLogin({ code: 'VHJM42', username: 'noah', pin: '482611' }, '1.2.3.4', d)
    expect(r).toEqual({ status: 200, body: { ok: true, session: tokens } })
    expect(d.verify).toHaveBeenCalledWith('VHJM42', 'noah', '482611', '1.2.3.4')
    expect(d.createSession).toHaveBeenCalledWith('child-x@internal.home')
    // Svaret indeholder hverken e-mail eller bruger-id
    expect(JSON.stringify(r)).not.toContain('internal.home')
  })

  it('forkert login: samme svar uanset årsag og ingen session', async () => {
    const d = deps({ ok: false, reason: 'invalid' })
    const r = await childLogin({ code: 'X', username: 'y', pin: '1' }, 'ip', d)
    expect(r).toEqual({ status: 401, body: { ok: false, error: 'invalid' } })
    expect(d.createSession).not.toHaveBeenCalled()
  })

  it('låst login giver 429', async () => {
    const r = await childLogin({ code: 'X', username: 'y', pin: '1' }, 'ip', deps({ ok: false, reason: 'locked' }))
    expect(r).toEqual({ status: 429, body: { ok: false, error: 'locked' } })
  })

  it('ugyldige felter afvises uden at kalde databasen', async () => {
    const d = deps({ ok: true, user_id: 'u', email: 'e' })
    for (const body of [null, {}, { code: 1, username: 'a', pin: '1' }, { code: 'A', username: 'a', pin: 'x'.repeat(11) }, { code: 'A'.repeat(21), username: 'a', pin: '1' }]) {
      expect((await childLogin(body, 'ip', d)).body).toEqual({ ok: false, error: 'invalid' })
    }
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('serverfejl lækker ingen detaljer', async () => {
    const d: LoginDeps = { verify: async () => { throw new Error('db nede: secret') }, createSession: async () => tokens }
    const r = await childLogin({ code: 'A', username: 'b', pin: '1' }, 'ip', d)
    expect(r).toEqual({ status: 500, body: { ok: false, error: 'server' } })
  })

  it('finder klientens IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers({ 'cf-connecting-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientIp(new Headers())).toBe('ukendt')
  })
})
