import { describe, expect, it } from 'vitest'
import { ageOn, describeFamily, familyComposition, unlinkedChildLogins } from './family'

const today = new Date(2026, 9, 12) // 12. oktober 2026
const child = (name: string, born_on: string, member_user_id: string | null = null) => ({ id: name, name, born_on, member_user_id })

describe('familiens sammensætning', () => {
  it('alder regnes i fyldte år', () => {
    expect(ageOn('2023-10-12', today)).toBe(3)
    expect(ageOn('2023-10-13', today)).toBe(2)
    expect(ageOn('2016-01-01', today)).toBe(10)
  })
  it('2 voksne + 2 børn (3 og 10 år), selv om kun det ene barn har login', () => {
    const f = familyComposition({ adults: 2, adultLogins: 2, children: [child('Noah', '2016-05-01', 'u-noah'), child('Lille', '2023-06-01')] }, today)
    expect(f).toEqual({ adults: 2, children: [{ age: 10 }, { age: 3 }] })
    expect(describeFamily(f)).toBe('2 voksne · 2 børn (10 og 3 år)')
  })
  it('barn med login tælles ikke to gange', () => {
    const children = [child('Noah', '2016-05-01', 'u-noah')]
    expect(familyComposition({ adults: null, adultLogins: 2, children }, today).children).toHaveLength(1)
    expect(unlinkedChildLogins([{ userId: 'u-noah' }, { userId: 'u-lina' }], children)).toEqual([{ userId: 'u-lina' }])
  })
  it('antal voksne: familiens valg, ellers voksne med login', () => {
    expect(familyComposition({ adults: null, adultLogins: 1, children: [] }, today).adults).toBe(1)
    expect(familyComposition({ adults: 3, adultLogins: 1, children: [] }, today).adults).toBe(3)
    expect(describeFamily({ adults: 1, children: [] })).toBe('1 voksen · ingen børn')
    expect(describeFamily({ adults: 2, children: [{ age: 5 }] })).toBe('2 voksne · 1 barn (5 år)')
  })
})
