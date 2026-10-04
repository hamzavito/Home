import { describe, expect, it } from 'vitest'
import { formatAmount, formatKr, parseKr, toInputValue } from './money'

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('formatKr', () => {
  it('viser øre med komma', () => {
    expect(nbsp(formatKr(63875))).toBe('638,75 kr.')
  })
  it('viser hele kroner uden decimaler', () => {
    expect(nbsp(formatKr(1245000))).toBe('12.450 kr.')
  })
  it('kan tvinge decimaler', () => {
    expect(nbsp(formatKr(500000, { decimals: 'always' }))).toBe('5.000,00 kr.')
  })
})

describe('parseKr', () => {
  it.each([
    ['638,75', 63875],
    ['1.234,50', 123450],
    ['1234', 123400],
    ['12 000 kr.', 1200000],
    ['0,5', 50],
  ])('%s → %i øre', (input, expected) => {
    expect(parseKr(input)).toBe(expected)
  })
  it.each(['', 'abc', '1,234', '12.34', '1,999'])('afviser "%s"', (input) => {
    expect(parseKr(input)).toBeNull()
  })
})

describe('formatAmount / toInputValue', () => {
  it('tal uden kr.', () => expect(nbsp(formatAmount(1245000))).toBe('12.450'))
  it('negative vises som absolut værdi', () => expect(formatAmount(-63875)).toBe('638,75'))
  it('input-værdi', () => {
    expect(toInputValue(63875)).toBe('638,75')
    expect(toInputValue(500000)).toBe('5000')
    expect(toInputValue(505)).toBe('5,05')
  })
})
