import { describe, expect, it } from 'vitest'
import { formatPercent, parsePercent, percentInputValue } from './percent'

describe('procent', () => {
  it.each([
    ['65', 6500],
    ['32,5', 3250],
    ['100 %', 10000],
    ['0', 0],
    ['12.25', 1225],
  ])('%s → %i bp', (i, bp) => expect(parsePercent(i)).toBe(bp))
  it.each(['', 'abc', '101', '-5', '1,234'])('afviser "%s"', (i) => expect(parsePercent(i)).toBeNull())
  it('formatering', () => {
    expect(formatPercent(6500)).toBe('65 %')
    expect(formatPercent(3250)).toBe('32,5 %')
    expect(percentInputValue(3250)).toBe('32,5')
  })
})
