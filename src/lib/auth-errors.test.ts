import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './auth-errors'

describe('authErrorMessage', () => {
  it('forkert eller udløbet kode', () => {
    expect(authErrorMessage({ code: 'otp_expired', status: 403 })).toMatch(/forkert eller udløbet/)
    expect(authErrorMessage({ status: 403, message: 'Token has expired or is invalid' })).toMatch(/forkert eller udløbet/)
  })
  it('hastighedsbegrænsning', () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/For mange/)
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/For mange/)
  })
  it('svag adgangskode', () => expect(authErrorMessage({ code: 'weak_password' })).toMatch(/svag/))
  it('ukendt fejl afslører intet', () => expect(authErrorMessage({ status: 400, message: 'User not found' })).toMatch(/Noget gik galt/))
})
