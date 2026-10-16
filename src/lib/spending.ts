// Hvor meget bruger I ca. pr. måned? Gennemsnit af de seneste hele måneder pr. kategori.
// Kun fælles udgifter (som budgetterne); private udgifter indgår ikke.

export type SpendingTx = { category_id: string; amount_ore: number; occurred_on: string; visibility: 'shared' | 'private' }

export type AverageSpending = {
  /** Gennemsnit pr. måned pr. kategori (øre) */
  byCategory: Map<string, number>
  totalOre: number
  /** Antal måneder gennemsnittet bygger på (0 = ingen data) */
  months: number
  /** 'previous' = seneste hele måneder; 'current' = kun denne måned indtil nu (undervurderer) */
  basis: 'previous' | 'current' | 'none'
}

const monthsBetween = (fromMonth: string, toMonth: string) => {
  const [fy, fm] = fromMonth.split('-').map(Number) as [number, number]
  const [ty, tm] = toMonth.split('-').map(Number) as [number, number]
  return (ty - fy) * 12 + (tm - fm)
}

/**
 * `currentMonth` er første dag i denne måned ("2026-10-01"). Op til `maxMonths` hele måneder før den bruges;
 * gennemsnittet deles med antal måneder siden første registrerede udgift (så en ny bruger ikke undervurderes).
 */
export function averageSpending(txs: SpendingTx[], currentMonth: string, maxMonths = 3): AverageSpending {
  const shared = txs.filter((t) => t.visibility === 'shared' && t.amount_ore > 0)
  const monthOf = (t: SpendingTx) => `${t.occurred_on.slice(0, 7)}-01`
  const previous = shared.filter((t) => {
    const back = monthsBetween(monthOf(t), currentMonth)
    return back >= 1 && back <= maxMonths
  })
  const use = previous.length > 0 ? previous : shared.filter((t) => t.occurred_on.slice(0, 7) === currentMonth.slice(0, 7))
  if (use.length === 0) return { byCategory: new Map(), totalOre: 0, months: 0, basis: 'none' }

  const basis = previous.length > 0 ? 'previous' : 'current'
  let months = 1
  if (basis === 'previous') {
    const earliest = use.reduce((m, t) => (t.occurred_on < m ? t.occurred_on : m), use[0]!.occurred_on).slice(0, 7) + '-01'
    months = Math.min(Math.max(monthsBetween(earliest, currentMonth), 1), maxMonths)
  }
  const sums = new Map<string, number>()
  for (const t of use) sums.set(t.category_id, (sums.get(t.category_id) ?? 0) + t.amount_ore)
  const byCategory = new Map([...sums].map(([id, sum]) => [id, Math.round(sum / months)]))
  return { byCategory, totalOre: [...byCategory.values()].reduce((s, n) => s + n, 0), months, basis }
}
