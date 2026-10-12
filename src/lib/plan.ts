// Månedens plan – samme regler som databasen (month_income, category_budgets, month_plan).
// Bruges af demoen og til forhåndsvisning; databasen er sandheden i appen.
//
//   1. Indtægter: pr. kilde de faktiske indtægter i måneden, ellers det forventede beløb
//   2. − faste udgifter                          = tilbage
//   3. − kategorier med fast beløb (inkl. månedens overstyring)
//   4. resten fordeles på procentkategorier (største-rest, præcist i øre)
//   5. det, der ikke er fordelt, vises som ufordelt (negativt = overfordelt)

export type PlanIncome = { actualOre: number; entryCount: number; expectedOre: number | null }
export type PlanCategory = { id: string; mode: 'amount' | 'percent' | 'none'; amountOre?: number | null; percentBp?: number | null; overrideOre?: number | null }

export type PlanResult = {
  incomeOre: number
  actualIncomeOre: number
  expectedIncomeOre: number
  fixedExpensesOre: number
  availableOre: number
  fixedAllocationsOre: number
  distributableOre: number
  percentTotalBp: number
  allocatedOre: number
  unallocatedOre: number
  /** Effektivt beløb pr. kategori og om det er standard eller månedens overstyring */
  budgets: Record<string, { ore: number; source: 'default' | 'override' | 'none' }>
}

export const MAX_PERCENT_BP = 10000

/** Pr. kilde: faktisk, hvis der er indtægter i måneden, ellers forventet */
export function incomeUsed(i: PlanIncome): { ore: number; status: 'actual' | 'expected' } {
  return i.entryCount > 0 ? { ore: i.actualOre, status: 'actual' } : { ore: i.expectedOre ?? 0, status: 'expected' }
}

/** Fordel `total` øre efter vægte (basispoint), så summen går præcis op (største-rest-metoden). */
export function splitByPercent(total: number, parts: Array<{ id: string; bp: number }>): Map<string, number> {
  const bp = parts.reduce((s, p) => s + p.bp, 0)
  const denom = Math.max(bp, MAX_PERCENT_BP)
  const target = Math.round((total * Math.min(bp, MAX_PERCENT_BP)) / MAX_PERCENT_BP)
  const rows = parts.map((p) => {
    // Heltalsaritmetik: total * bp kan være stort, men holder sig under 2^53 for realistiske beløb
    const num = total * p.bp
    const fl = Math.floor(num / denom)
    return { id: p.id, fl, rem: num - fl * denom }
  })
  let rest = target - rows.reduce((s, r) => s + r.fl, 0)
  const order = [...rows].sort((a, b) => b.rem - a.rem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const r of order) {
    if (rest <= 0) break
    r.fl += 1
    rest--
  }
  return new Map(rows.map((r) => [r.id, r.fl]))
}

export function computePlan(input: { incomes: PlanIncome[]; fixedExpensesOre: number; categories: PlanCategory[] }): PlanResult {
  const used = input.incomes.map(incomeUsed)
  const incomeOre = used.reduce((s, u) => s + u.ore, 0)
  const actualIncomeOre = used.filter((u) => u.status === 'actual').reduce((s, u) => s + u.ore, 0)
  const availableOre = incomeOre - input.fixedExpensesOre
  const amountCats = input.categories.filter((c) => c.mode === 'amount')
  const percentCats = input.categories.filter((c) => c.mode === 'percent')
  const fixedAllocationsOre = amountCats.reduce((s, c) => s + (c.overrideOre ?? c.amountOre ?? 0), 0)
  const distributableOre = Math.max(availableOre - fixedAllocationsOre, 0)
  const percentTotalBp = percentCats.reduce((s, c) => s + (c.percentBp ?? 0), 0)
  const pct = splitByPercent(distributableOre, percentCats.map((c) => ({ id: c.id, bp: c.percentBp ?? 0 })))

  const budgets: PlanResult['budgets'] = {}
  for (const c of input.categories) {
    const override = c.overrideOre ?? null
    const ore = override ?? (c.mode === 'amount' ? (c.amountOre ?? 0) : c.mode === 'percent' ? (pct.get(c.id) ?? 0) : 0)
    budgets[c.id] = { ore, source: override !== null ? 'override' : c.mode === 'none' ? 'none' : 'default' }
  }
  const allocatedOre = Object.values(budgets).reduce((s, b) => s + b.ore, 0)
  return {
    incomeOre,
    actualIncomeOre,
    expectedIncomeOre: incomeOre - actualIncomeOre,
    fixedExpensesOre: input.fixedExpensesOre,
    availableOre,
    fixedAllocationsOre,
    distributableOre,
    percentTotalBp,
    allocatedOre,
    unallocatedOre: availableOre - allocatedOre,
    budgets,
  }
}

/** Fejl, hvis procenterne tilsammen er over 100 %. */
export function percentProblem(totalBp: number): string | null {
  return totalBp > MAX_PERCENT_BP ? `Procentfordelingen må højst være 100 % (er nu ${(totalBp / 100).toLocaleString('da-DK', { maximumFractionDigits: 2 })} %)` : null
}
