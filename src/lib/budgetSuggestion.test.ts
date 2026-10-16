import { describe, expect, it } from 'vitest'
import { categoryPoints, suggestBudget, suggestFromSpending, type SuggestionCategory } from './budgetSuggestion'

const two = { adults: 2, children: [] }
const family = { adults: 2, children: [{ age: 3 }, { age: 10 }] }
const cat = (id: string, name: string, mode: SuggestionCategory['mode'] = 'none', percentBp: number | null = null): SuggestionCategory => ({ id, name, mode, percentBp, archived: false })
const share = (s: ReturnType<typeof suggestBudget>, name: string) => s.items.find((i) => i.name === name)?.percentBp ?? 0

describe('budgetforslag', () => {
  it('fordeler præcist 100 % i hele procent', () => {
    for (const f of [two, family, { adults: 1, children: [{ age: 0 }] }, { adults: 3, children: [{ age: 1 }, { age: 5 }, { age: 9 }, { age: 15 }] }]) {
      const s = suggestBudget(f, [])
      expect(s.totalBp).toBe(10000)
      expect(s.items.every((i) => i.percentBp % 100 === 0 && i.percentBp > 0)).toBe(true)
    }
  })
  it('børn i familien giver kategorien Børn og mere til dagligvarer – uden børn ingen Børn-kategori', () => {
    const without = suggestBudget(two, [])
    const withKids = suggestBudget(family, [])
    expect(without.items.some((i) => i.name === 'Børn')).toBe(false)
    expect(share(withKids, 'Børn')).toBeGreaterThan(0)
    expect(share(withKids, 'Børn') + share(withKids, 'Dagligvarer')).toBeGreaterThan(share(without, 'Dagligvarer'))
  })
  it('flere børn giver et større børnebudget', () => {
    const one = suggestBudget({ adults: 2, children: [{ age: 5 }] }, [])
    const three = suggestBudget({ adults: 2, children: [{ age: 5 }, { age: 8 }, { age: 11 }] }, [])
    expect(share(three, 'Børn')).toBeGreaterThan(share(one, 'Børn'))
  })
  it('bruger eksisterende kategorier, opretter resten og rører ikke fast beløb', () => {
    const s = suggestBudget(family, [cat('a', 'dagligvarer'), cat('b', 'Bil', 'amount'), cat('c', 'Egen kategori', 'percent', 1000)])
    expect(s.items.find((i) => i.name === 'Dagligvarer')?.categoryId).toBe('a')
    expect(s.items.some((i) => i.name === 'Bil')).toBe(false)
    expect(s.items.find((i) => i.name === 'Børn')?.categoryId).toBeNull()
    // "Egen kategori" bevarer sine 10 %, forslaget fordeler resten
    expect(s.keptBp).toBe(1000)
    expect(s.totalBp).toBe(9000)
    expect(s.totalBp + s.keptBp).toBeLessThanOrEqual(10000)
  })
  it('husker nuværende procent og springer arkiverede over', () => {
    const s = suggestBudget(two, [cat('a', 'Ferie', 'percent', 500), { ...cat('b', 'Restaurant'), archived: true }])
    expect(s.items.find((i) => i.name === 'Ferie')?.currentBp).toBe(500)
    expect(s.items.find((i) => i.name === 'Restaurant')?.categoryId).toBeNull()
  })
  it('intet at fordele, når andre procenter fylder 100 %', () => {
    expect(suggestBudget(two, [cat('x', 'Andet', 'percent', 10000)]).items).toEqual([])
  })
  it('point afhænger af alder', () => {
    expect(categoryPoints({ adults: 2, children: [{ age: 1 }] }).Dagligvarer).toBeLessThan(categoryPoints({ adults: 2, children: [{ age: 14 }] }).Dagligvarer)
  })
})

describe('budgetforslag ud fra forbrug', () => {
  const mad = cat('mad', 'Mad', 'percent', 5000)
  const hygge = cat('hygge', 'Hygge')
  const avg = (o: Record<string, number>) => new Map(Object.entries(o))
  it('hver kategori får så meget, som forbruget kræver (op til hele procent)', () => {
    const s = suggestFromSpending([mad, hygge], avg({ mad: 400000, hygge: 150000 }), 1000000)
    expect(share(s, 'Mad')).toBe(4000) // 4.000 af 10.000 kr.
    expect(share(s, 'Hygge')).toBe(1500)
    expect(s.totalBp).toBe(5500) // resten står ufordelt
  })
  it('kræver forbruget mere end der er, skaleres det ned til højst 100 %', () => {
    const s = suggestFromSpending([mad, hygge], avg({ mad: 900000, hygge: 300000 }), 1000000)
    expect(s.totalBp).toBe(10000)
    expect(share(s, 'Mad')).toBe(7500)
  })
  it('uden kendt til-fordeling fordeles det ledige efter forbrugets størrelse', () => {
    const s = suggestFromSpending([mad, hygge], avg({ mad: 300000, hygge: 100000 }), 0)
    expect(s.totalBp).toBe(10000)
    expect(share(s, 'Mad')).toBe(7500)
  })
  it('rører ikke fast beløb, reserver eller kategorier uden forbrug, og husker gennemsnittet', () => {
    const s = suggestFromSpending([cat('b', 'Bil', 'amount'), { ...cat('r', 'Buffer'), kind: 'reserve' }, cat('x', 'Rejse', 'percent', 1000), hygge], avg({ b: 50000, r: 50000, hygge: 100000 }), 1000000)
    expect(s.items.map((i) => i.name)).toEqual(['Hygge'])
    expect(s.items[0]!.avgOre).toBe(100000)
    expect(s.keptBp).toBe(1000)
  })
})
