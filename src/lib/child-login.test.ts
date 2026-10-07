import { describe, expect, it } from 'vitest'
import { isValidPin } from '../../supabase/functions/_shared/child-rules'
import { isHiddenEmail, normalizeUsername, pinProblem, USERNAME_RE } from './child-login'

describe('barnelogin-regler', () => {
  it('PIN-regler er de samme som på serveren', () => {
    for (const [pin, len] of [['482611', 6], ['7395', 4], ['123456', 6], ['000000', 6], ['9876', 4], ['48261', 6], ['4826', 6], ['890123', 6]] as const) {
      expect(pinProblem(pin, len) === null).toBe(isValidPin(pin, len))
    }
    expect(pinProblem('482611', 6)).toBeNull()
    expect(pinProblem('4826', 6)).toBe('PIN skal være 6 cifre')
  })
  it('brugernavne', () => {
    expect(USERNAME_RE.test(normalizeUsername(' Noah '))).toBe(true)
    expect(USERNAME_RE.test('søren.b')).toBe(true)
    expect(USERNAME_RE.test('n')).toBe(false)
    expect(USERNAME_RE.test('no ah')).toBe(false)
  })
  it('skjulte e-mails genkendes', () => {
    expect(isHiddenEmail('child-1@internal.home')).toBe(true)
    expect(isHiddenEmail('hamza@demo.dk')).toBe(false)
  })
})
