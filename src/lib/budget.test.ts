import { describe, expect, it } from 'vitest'
import { budgetStatus, percentUsed } from './budget'

describe('budgetStatus', () => {
  it.each([
    [0, 500000, 'normal'],
    [349999, 500000, 'normal'],
    [350000, 500000, 'notice'],
    [449999, 500000, 'notice'],
    [450000, 500000, 'warning'],
    [500000, 500000, 'warning'],
    [500001, 500000, 'over'],
    [0, 0, 'none'],
    [100, 0, 'over'],
  ] as const)('%i af %i → %s', (spent, budget, expected) => {
    expect(budgetStatus(spent, budget)).toBe(expected)
  })
})

describe('percentUsed', () => {
  it('runder af', () => expect(percentUsed(387000, 500000)).toBe(77))
  it('kan overstige 100', () => expect(percentUsed(600000, 500000)).toBe(120))
  it('intet budget', () => expect(percentUsed(0, 0)).toBe(0))
})
