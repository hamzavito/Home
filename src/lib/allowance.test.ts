import { describe, expect, it } from 'vitest'
import { describeAllowance, isDueOn, isoWeekday, nextAllowance, periodKey, type AllowanceLike } from './allowance'

const base: AllowanceLike = { frequency: 'weekly', weekday: 5, month_day: null, start_on: '2026-10-01', end_on: null, pay_from: '2026-10-01', paused_at: null, stopped_at: null }

describe('faste lommepenge', () => {
  it('beskriver ordningen', () => {
    expect(describeAllowance(base)).toBe('Hver fredag')
    expect(describeAllowance({ frequency: 'monthly', weekday: null, month_day: 1 })).toBe('Den 1. i hver måned')
    expect(describeAllowance({ frequency: 'monthly', weekday: null, month_day: 0 })).toBe('Sidste dag i hver måned')
  })

  it('ugedage og periodenøgler som i databasen', () => {
    expect(isoWeekday('2026-10-09')).toBe(5)
    expect(isoWeekday('2026-10-11')).toBe(7)
    expect(periodKey('weekly', '2026-10-09')).toBe('2026-W41')
    expect(periodKey('weekly', '2027-01-01')).toBe('2026-W53')
    expect(periodKey('weekly', '2027-01-04')).toBe('2027-W01')
    expect(periodKey('monthly', '2027-02-28')).toBe('2027-02')
  })

  it('den 31. bliver sidste dag i korte måneder', () => {
    const m = { frequency: 'monthly' as const, weekday: null, month_day: 31 }
    expect(isDueOn(m, '2027-02-28')).toBe(true)
    expect(isDueOn(m, '2027-04-30')).toBe(true)
    expect(isDueOn(m, '2027-03-30')).toBe(false)
    expect(isDueOn({ ...m, month_day: 0 }, '2028-02-29')).toBe(true)
  })

  it('næste udbetaling', () => {
    expect(nextAllowance(base, '2026-10-07')).toBe('2026-10-09')
    // I dag er fredag, men perioden er allerede udbetalt
    expect(nextAllowance(base, '2026-10-09', new Set(['2026-W41']))).toBe('2026-10-16')
    expect(nextAllowance({ ...base, start_on: '2026-11-01', pay_from: '2026-11-01' }, '2026-10-07')).toBe('2026-11-06')
    expect(nextAllowance({ ...base, paused_at: 'x' }, '2026-10-07')).toBeNull()
    expect(nextAllowance({ ...base, end_on: '2026-10-08' }, '2026-10-07')).toBeNull()
    expect(nextAllowance({ ...base, frequency: 'monthly', weekday: null, month_day: 1 }, '2026-10-07')).toBe('2026-11-01')
  })
})
