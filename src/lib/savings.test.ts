import { describe, expect, it } from 'vitest'
import { averageMonthly, projectGoal, requiredMonthly } from './savings'

const today = new Date(2026, 9, 5, 12)

describe('opsparing', () => {
  it('gennemsnit over 3 måneder (hævninger trækkes fra)', () => {
    const mv = [
      { kind: 'deposit' as const, amount_ore: 300000, occurred_on: '2026-08-10' },
      { kind: 'deposit' as const, amount_ore: 300000, occurred_on: '2026-09-10' },
      { kind: 'withdrawal' as const, amount_ore: 60000, occurred_on: '2026-10-01' },
      { kind: 'deposit' as const, amount_ore: 999999, occurred_on: '2026-01-01' },
    ]
    expect(averageMonthly(mv, today)).toBe(180000)
  })
  it('fremskrivning', () => {
    expect(projectGoal(1350000, 2500000, 250000, today)).toEqual({ kind: 'eta', months: 5, date: new Date(2027, 2, 1, 12) })
    expect(projectGoal(2500000, 2500000, 0, today)).toEqual({ kind: 'reached' })
    expect(projectGoal(0, 100, 0, today)).toEqual({ kind: 'no-trend' })
  })
  it('krævet beløb pr. måned til måldato', () => {
    expect(requiredMonthly(1350000, 2500000, '2027-06-01', today)).toBe(143750)
    expect(requiredMonthly(1350000, 2500000, '2026-09-01', today)).toBeNull()
    expect(requiredMonthly(3000000, 2500000, '2027-06-01', today)).toBe(0)
  })
})
