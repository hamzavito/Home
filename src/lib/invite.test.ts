import { describe, expect, it } from 'vitest'
import { formatInviteCode, inviteLink, isValidInviteCode, normalizeInviteCode } from './invite'

describe('invitationskoder', () => {
  it('normaliserer kode, mellemrum, bindestreg og link', () => {
    expect(normalizeInviteCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeInviteCode(' abcd efgh ')).toBe('ABCDEFGH')
    expect(normalizeInviteCode('https://hjem.example/invitation/ABCD-EFGH')).toBe('ABCDEFGH')
  })
  it('accepterer kun letlæselige tegn', () => {
    expect(isValidInviteCode('ABCD-EFGH')).toBe(true)
    expect(isValidInviteCode('ABCD-EFG0')).toBe(false)
    expect(isValidInviteCode('ABCD-EFGI')).toBe(false)
    expect(isValidInviteCode('ABCDEFG')).toBe(false)
  })
  it('viser koden i to dele og laver et link', () => {
    expect(formatInviteCode('abcdefgh')).toBe('ABCD-EFGH')
    expect(inviteLink('abcd-efgh', 'https://hjem.example')).toBe('https://hjem.example/invitation/ABCDEFGH')
  })
})
