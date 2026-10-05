import { describe, expect, it } from 'vitest'
import { cumulativeByDay, daysInMonth, elapsedDays } from './series'

describe('series', () => {
  it('dage i måneden', () => {
    expect(daysInMonth('2026-02-01')).toBe(28)
    expect(daysInMonth('2026-10-01')).toBe(31)
  })
  it('forløbne dage', () => {
    const today = new Date(2026, 9, 4, 12)
    expect(elapsedDays('2026-10-01', today)).toBe(4)
    expect(elapsedDays('2026-09-01', today)).toBe(30)
    expect(elapsedDays('2026-11-01', today)).toBe(0)
  })
  it('kumuleret forbrug', () => {
    const items = [
      { date: '2026-10-01', ore: 100 },
      { date: '2026-10-03', ore: 50 },
      { date: '2026-10-03', ore: 25 },
      { date: '2026-09-30', ore: 999 },
    ]
    expect(cumulativeByDay('2026-10-01', items, 4)).toEqual([100, 100, 175, 175])
  })
})
