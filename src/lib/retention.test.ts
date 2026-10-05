import { describe, expect, it } from 'vitest'
import { addMonthsClamped, deleteDateFor, retentionBadge, retentionSentence, toDkIsoDate } from './retention'

describe('opbevaring', () => {
  const base = '2026-10-05'
  it.each([
    ['30d', '2026-11-04'],
    ['3m', '2027-01-05'],
    ['6m', '2027-04-05'],
    ['1y', '2027-10-05'],
  ] as const)('%s → %s', (r, expected) => {
    expect(deleteDateFor(r, base)).toBe(expected)
  })
  it('vælg dato og permanent', () => {
    expect(deleteDateFor('custom', base, '2027-01-01')).toBe('2027-01-01')
    expect(deleteDateFor('permanent', base)).toBeNull()
  })
  it('måneder klemmes som i Postgres', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2027-11-30', 3)).toBe('2028-02-29')
  })
  it('dansk dato fra timestamptz (midnat dansk tid)', () => {
    expect(toDkIsoDate('2026-11-03T23:00:00Z')).toBe('2026-11-04')
  })
  it('badges', () => {
    expect(retentionBadge({ deleteAt: '2026-10-28T23:00:00Z', imageDeletedAt: null }, '2026-10-05')).toBe('24 dage tilbage')
    expect(retentionBadge({ deleteAt: '2026-10-05T22:00:00Z', imageDeletedAt: null }, '2026-10-05')).toBe('Slettes i morgen')
    expect(retentionBadge({ deleteAt: null, imageDeletedAt: null })).toBe('Beholdes permanent')
    expect(retentionBadge({ deleteAt: '2026-01-01T00:00:00Z', imageDeletedAt: '2026-01-01T03:00:00Z' })).toBe('Billede slettet')
  })
  it('sætning', () => {
    expect(retentionSentence('2026-11-04')).toBe('Kvitteringen slettes automatisk 4. november 2026.')
  })
})
