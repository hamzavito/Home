import { describe, expect, it } from 'vitest'
import { averageSpending, type SpendingTx } from './spending'

const tx = (category_id: string, amount_ore: number, occurred_on: string, visibility: SpendingTx['visibility'] = 'shared'): SpendingTx => ({ category_id, amount_ore, occurred_on, visibility })
const NOW = '2026-10-01'

describe('gennemsnitligt forbrug', () => {
  it('gennemsnit af de seneste tre hele måneder pr. kategori', () => {
    const a = averageSpending(
      [tx('mad', 300000, '2026-07-10'), tx('mad', 360000, '2026-08-12'), tx('mad', 420000, '2026-09-05'), tx('bil', 90000, '2026-09-20'), tx('mad', 999999, '2026-10-02')],
      NOW,
    )
    expect(a.basis).toBe('previous')
    expect(a.months).toBe(3)
    expect(a.byCategory.get('mad')).toBe(360000) // denne måned tæller ikke med
    expect(a.byCategory.get('bil')).toBe(30000)
    expect(a.totalOre).toBe(390000)
  })
  it('en ny bruger undervurderes ikke: delt med måneder siden første udgift', () => {
    const a = averageSpending([tx('mad', 200000, '2026-09-03'), tx('mad', 100000, '2026-09-20')], NOW)
    expect(a.months).toBe(1)
    expect(a.byCategory.get('mad')).toBe(300000)
    expect(averageSpending([tx('mad', 400000, '2026-08-03')], NOW).byCategory.get('mad')).toBe(200000)
  })
  it('private udgifter og indtægter/negative beløb tælles ikke', () => {
    const a = averageSpending([tx('mad', 100000, '2026-09-03'), tx('mad', 500000, '2026-09-04', 'private'), tx('mad', -5000, '2026-09-05')], NOW)
    expect(a.byCategory.get('mad')).toBe(100000)
  })
  it('uden hele måneder bruges denne måned indtil nu; uden data ingenting', () => {
    const a = averageSpending([tx('mad', 50000, '2026-10-03')], NOW)
    expect(a).toMatchObject({ basis: 'current', months: 1, totalOre: 50000 })
    expect(averageSpending([], NOW)).toMatchObject({ basis: 'none', months: 0, totalOre: 0 })
  })
  it('ældre end tre måneder tæller slet ikke med', () => {
    const a = averageSpending([tx('mad', 600000, '2026-03-03'), tx('mad', 300000, '2026-09-03')], NOW)
    expect(a.months).toBe(1)
    expect(a.byCategory.get('mad')).toBe(300000) // marts er for gammel
  })
})
