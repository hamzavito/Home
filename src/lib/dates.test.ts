import { describe, expect, it } from 'vitest'
import { formatLongDate, formatMonthYear, formatShortDate, fromIsoDate, monthKey, toIsoDate } from './dates'

describe('danske datoer', () => {
  const d = fromIsoDate('2026-10-04')
  it('lang dato', () => expect(formatLongDate(d)).toBe('4. oktober 2026'))
  it('kort dato', () => expect(formatShortDate(fromIsoDate('2026-10-18'))).toBe('18. okt.'))
  it('måned og år', () => expect(formatMonthYear(d)).toBe('oktober 2026'))
  it('iso tur-retur', () => expect(toIsoDate(d)).toBe('2026-10-04'))
  it('månedsnøgle', () => expect(monthKey(fromIsoDate('2026-12-31'))).toBe('2026-12-01'))
})

describe('relative datoer', () => {
  const now = new Date(2026, 9, 4, 15)
  it('i dag / i går / dato', async () => {
    const { relativeDay, dayLabel } = await import('./dates')
    expect(relativeDay('2026-10-04', now)).toBe('I dag')
    expect(relativeDay('2026-10-03', now)).toBe('I går')
    expect(relativeDay('2026-09-28', now)).toBe('28. sep.')
    expect(dayLabel('2026-10-01', now)).toBe('Torsdag 1. okt.')
  })
})
