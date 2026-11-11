import { describe, expect, it } from 'vitest'
import { parseIcsUtcDateTime } from './icsImportUtcTime'

describe('strict ICS UTC date-time conversion', () => {
  it('parses explicit UTC times without using the device timezone', () => {
    expect(parseIcsUtcDateTime('20261112T070000Z').toISOString()).toBe('2026-11-12T07:00:00.000Z')
    expect(parseIcsUtcDateTime('20240229T235959Z').toISOString()).toBe('2024-02-29T23:59:59.000Z')
  })

  it.each([
    '20261112T070000',
    '20261112',
    '20261112T070000+0100',
    'TZID=Europe/Copenhagen:20261112T070000',
    '20261112T0700Z',
    '20261112T070060Z',
  ])('does not guess a timezone for unsupported date-times', (value) => {
    expect(() => parseIcsUtcDateTime(value)).toThrow()
  })

  it.each([
    '20260229T070000Z',
    '20261312T070000Z',
    '20261131T070000Z',
    '20261112T240000Z',
    '20261112T076000Z',
    '00000101T000000Z',
  ])('rejects invalid calendar dates instead of normalizing them', (value) => {
    expect(() => parseIcsUtcDateTime(value)).toThrow('Ugyldig kalendertid')
  })
})
