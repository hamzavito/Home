// Forslag til budgetfordeling ud fra familiens sammensætning (familieoplysningerne).
//
// Forslaget er en udgangspunkt-fordeling i procent af det, der er til fordeling efter faste udgifter
// og kategorier med fast beløb – ikke en facitliste. Alt kan rettes bagefter.
//   * Hver kategori får point ud fra, hvem der bor i husstanden (voksne og børn efter alder)
//   * Pointene omregnes til hele procent, der summer præcist til det, der er ledigt (største-rest)
//   * Kategorier med fast beløb røres ikke, og andre procentkategorier bevares

import { suggestedCategories } from './categories'
import type { FamilyComposition } from './family'
import { MAX_PERCENT_BP } from './plan'

export type SuggestionCategory = {
  id: string
  name: string
  mode: 'amount' | 'percent' | 'none'
  percentBp: number | null
  archived: boolean
  icon?: string
  color?: string
  kind?: 'spending' | 'reserve'
}

export type SuggestionItem = {
  name: string
  icon: string
  color: string
  /** Eksisterende kategori (id) – ellers oprettes den */
  categoryId: string | null
  percentBp: number
  /** Nuværende standardprocent (0 hvis ingen) */
  currentBp: number
  /** Gennemsnitligt forbrug pr. måned (kun i forslag ud fra forbrug) */
  avgOre?: number
}

export type BudgetSuggestion = {
  items: SuggestionItem[]
  /** Procent (bp), som andre procentkategorier allerede bruger og ikke ændres */
  keptBp: number
  /** Procent (bp) forslaget fordeler */
  totalBp: number
}

const foodFactor = (age: number) => (age < 3 ? 0.3 : age < 7 ? 0.5 : age < 13 ? 0.7 : 1)
const kidFactor = (age: number) => (age < 3 ? 1.2 : age < 7 ? 1 : age < 13 ? 0.9 : 1.1)

/** Point pr. kategori for en familie – kun forholdet mellem dem har betydning */
export function categoryPoints(family: FamilyComposition) {
  const adults = Math.max(family.adults, 1)
  const kids = family.children.length
  const persons = adults + kids
  const foodUnits = adults + family.children.reduce((s, c) => s + foodFactor(c.age), 0)
  const kidCost = family.children.reduce((s, c) => s + kidFactor(c.age), 0)
  return {
    Dagligvarer: 22 * foodUnits,
    Restaurant: 5 * adults + 2 * kids,
    Shopping: 6 * adults + 3 * kids,
    Børn: kids > 0 ? 14 * kidCost : 0,
    Bil: 12,
    Ferie: 6 + 2 * persons,
    Diverse: 5 + persons,
  }
}

/** Fordel `units` heltal efter vægte (største-rest) */
function allocate(units: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0)
  if (units <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (w / total) * units)
  const out = raw.map(Math.floor)
  let rest = units - out.reduce((s, n) => s + n, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const o of order) {
    if (rest <= 0) break
    out[o.i]! += 1
    rest--
  }
  return out
}

const GRAIN_BP = 100 // hele procent

export function suggestBudget(family: FamilyComposition, categories: SuggestionCategory[]): BudgetSuggestion {
  const points: Record<string, number> = categoryPoints(family)
  const active = categories.filter((c) => !c.archived)
  const byName = new Map(active.map((c) => [c.name.trim().toLowerCase(), c]))

  // Kandidater: de kendte kategorier med point (eksisterende uden fast beløb, eller nye)
  const candidates = suggestedCategories
    .map((s) => ({ s, existing: byName.get(s.name.toLowerCase()) ?? null, points: points[s.name] ?? 0 }))
    .filter((c) => c.points > 0 && c.existing?.mode !== 'amount')

  const touched = new Set(candidates.flatMap((c) => (c.existing ? [c.existing.id] : [])))
  const keptBp = active.filter((c) => c.mode === 'percent' && !touched.has(c.id)).reduce((s, c) => s + (c.percentBp ?? 0), 0)
  const freeBp = Math.max(MAX_PERCENT_BP - keptBp, 0)
  const units = Math.floor(freeBp / GRAIN_BP)

  const shares = allocate(units, candidates.map((c) => c.points))
  const items: SuggestionItem[] = candidates
    .map((c, i) => ({
      name: c.s.name,
      icon: c.s.icon,
      color: c.s.color,
      categoryId: c.existing?.id ?? null,
      percentBp: shares[i]! * GRAIN_BP,
      currentBp: c.existing?.mode === 'percent' ? (c.existing.percentBp ?? 0) : 0,
    }))
    .filter((it) => it.percentBp > 0)
    .sort((a, b) => b.percentBp - a.percentBp || a.name.localeCompare(b.name, 'da'))

  return { items, keptBp, totalBp: items.reduce((s, it) => s + it.percentBp, 0) }
}

/**
 * Forslag ud fra det, I faktisk bruger: gennemsnit pr. måned pr. kategori.
 * Hver kategori får så meget af det, der er til fordeling, som forbruget kræver (rundet op til hele procent).
 * Kræver forbruget mere, end der er, skaleres det ned (største-rest); kræver det mindre, står resten ufordelt.
 * Uden kendt "til fordeling" fordeles hele det ledige efter forbrugets størrelse.
 */
export function suggestFromSpending(categories: SuggestionCategory[], avgByCategory: Map<string, number>, distributableOre: number): BudgetSuggestion {
  const active = categories.filter((c) => !c.archived)
  const candidates = active.filter((c) => (c.kind ?? 'spending') === 'spending' && c.mode !== 'amount' && (avgByCategory.get(c.id) ?? 0) > 0)
  const touched = new Set(candidates.map((c) => c.id))
  const keptBp = active.filter((c) => c.mode === 'percent' && !touched.has(c.id)).reduce((s, c) => s + (c.percentBp ?? 0), 0)
  const freeUnits = Math.floor(Math.max(MAX_PERCENT_BP - keptBp, 0) / GRAIN_BP)
  const avgs = candidates.map((c) => avgByCategory.get(c.id) ?? 0)

  let units: number[]
  if (distributableOre > 0) {
    const need = avgs.map((a) => Math.max(1, Math.ceil((a / distributableOre) * 100)))
    units = need.reduce((s, n) => s + n, 0) <= freeUnits ? need : allocate(freeUnits, avgs)
  } else {
    units = allocate(freeUnits, avgs)
  }

  const items: SuggestionItem[] = candidates
    .map((c, i) => ({
      name: c.name,
      icon: c.icon ?? 'sparkles',
      color: c.color ?? '#6d5cff',
      categoryId: c.id,
      percentBp: units[i]! * GRAIN_BP,
      currentBp: c.mode === 'percent' ? (c.percentBp ?? 0) : 0,
      avgOre: avgs[i]!,
    }))
    .filter((it) => it.percentBp > 0)
    .sort((a, b) => b.percentBp - a.percentBp || a.name.localeCompare(b.name, 'da'))
  return { items, keptBp, totalBp: items.reduce((s, it) => s + it.percentBp, 0) }
}
