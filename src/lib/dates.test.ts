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
