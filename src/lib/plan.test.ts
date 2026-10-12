import { describe, expect, it } from 'vitest'
import { computePlan, incomeUsed, percentProblem, splitByPercent, type PlanCategory } from './plan'

const cats: PlanCategory[] = [
  { id: 'buffer', mode: 'amount', amountOre: 200000 },
  { id: 'mad', mode: 'percent', percentBp: 6500 },
  { id: 'hygge', mode: 'percent', percentBp: 3500 },
]
const salary = (actualOre: number, entryCount = 1, expectedOre: number | null = 2900000) => ({ actualOre, entryCount, expectedOre })

describe('indtægter', () => {
  it('løn varierer fra måned til måned – det faktiske beløb bruges', () => {
    for (const ore of [2900000, 3040000, 2875000]) {
      expect(computePlan({ incomes: [salary(ore)], fixedExpensesOre: 0, categories: [] }).incomeOre).toBe(ore)
    }
  })
  it('uden faktisk indtægt bruges det forventede beløb og markeres', () => {
    expect(incomeUsed(salary(0, 0))).toEqual({ ore: 2900000, status: 'expected' })
    const p = computePlan({ incomes: [salary(3021143), salary(0, 0, 2500000)], fixedExpensesOre: 0, categories: [] })
    expect(p).toMatchObject({ incomeOre: 5521143, actualIncomeOre: 3021143, expectedIncomeOre: 2500000 })
  })
  it('små beløb på lønkilden erstatter ikke den forventede løn', () => {
    expect(incomeUsed(salary(7200, 2))).toEqual({ ore: 2900000, status: 'expected' })
    expect(incomeUsed(salary(1450000, 1))).toEqual({ ore: 1450000, status: 'actual' })
  })
  it('indtægter uden kilde tæller ikke med, før de er godkendt', () => {
    const p = computePlan({ incomes: [salary(2900000), { actualOre: 272100, entryCount: 5, expectedOre: null, assigned: false }], fixedExpensesOre: 0, categories: [] })
    expect(p.incomeOre).toBe(2900000)
  })
  it('manuel løn uden forventet beløb', () => {
    expect(computePlan({ incomes: [salary(2900000, 1, null)], fixedExpensesOre: 0, categories: [] }).incomeOre).toBe(2900000)
  })
})

describe('fordeling', () => {
  it('eksemplet fra regnearket: fast beløb + 65/35 præcist i øre', () => {
    const p = computePlan({ incomes: [salary(2900000)], fixedExpensesOre: 2382213, categories: cats })
    expect(p.availableOre).toBe(517787)
    expect(p.fixedAllocationsOre).toBe(200000)
    expect(p.distributableOre).toBe(317787)
    expect(p.budgets.mad!.ore).toBe(206562)
    expect(p.budgets.hygge!.ore).toBe(111225)
    expect(p.budgets.mad!.ore + p.budgets.hygge!.ore).toBe(p.distributableOre)
    expect(p.unallocatedOre).toBe(0)
  })
  it('summen går altid op i øre', () => {
    for (const total of [1, 2, 3, 99, 100001, 317787, 999999]) {
      const parts = [{ id: 'a', bp: 3333 }, { id: 'b', bp: 3333 }, { id: 'c', bp: 3334 }]
      const r = splitByPercent(total, parts)
      expect([...r.values()].reduce((s, v) => s + v, 0)).toBe(total)
    }
  })
  it('ufordelt vises, når procenterne kun er 80 %', () => {
    const p = computePlan({ incomes: [salary(2900000)], fixedExpensesOre: 2382213, categories: [cats[0]!, { id: 'mad', mode: 'percent', percentBp: 6500 }, { id: 'hygge', mode: 'percent', percentBp: 1500 }] })
    expect(p.percentTotalBp).toBe(8000)
    expect(p.unallocatedOre).toBe(Math.round(317787 * 0.2))
    expect(p.allocatedOre + p.unallocatedOre).toBe(p.availableOre)
  })
  it('over 100 % afvises', () => {
    expect(percentProblem(10000)).toBeNull()
    expect(percentProblem(10001)).toMatch(/højst være 100 %/)
  })
  it('over 100 % (gamle data) fordeler aldrig mere end der er', () => {
    const p = computePlan({ incomes: [salary(1000000, 1, null)], fixedExpensesOre: 0, categories: [{ id: 'a', mode: 'percent', percentBp: 8000 }, { id: 'b', mode: 'percent', percentBp: 4000 }] })
    expect(p.budgets.a!.ore + p.budgets.b!.ore).toBe(1000000)
  })
  it('negativt rådighedsbeløb: procentkategorier får 0', () => {
    const p = computePlan({ incomes: [salary(1000000, 1, null)], fixedExpensesOre: 1500000, categories: cats })
    expect(p.distributableOre).toBe(0)
    expect(p.budgets.mad!.ore).toBe(0)
    expect(p.unallocatedOre).toBeLessThan(0)
  })
})

describe('månedsoverstyring', () => {
  const base = { incomes: [salary(2900000)], fixedExpensesOre: 2382213 }
  it('påvirker kun den overstyrede kategori; resten vises som ufordelt/overfordelt', () => {
    const normal = computePlan({ ...base, categories: cats })
    const dec = computePlan({ ...base, categories: cats.map((c) => (c.id === 'mad' ? { ...c, overrideOre: 350000 } : c)) })
    expect(dec.budgets.mad).toEqual({ ore: 350000, source: 'override' })
    expect(dec.budgets.hygge).toEqual(normal.budgets.hygge)
    expect(dec.unallocatedOre).toBe(normal.budgets.mad!.ore - 350000)
  })
  it('overstyret fast beløb ændrer det, der er til fordeling, i den måned', () => {
    const p = computePlan({ ...base, categories: cats.map((c) => (c.id === 'buffer' ? { ...c, overrideOre: 100000 } : c)) })
    expect(p.distributableOre).toBe(417787)
    expect(p.budgets.buffer!.source).toBe('override')
  })
})
