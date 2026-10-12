// Familiens sammensætning – input til budgetforslag.
//
// To begreber holdes adskilt:
//   * Familieoplysninger (hvem bor i husstanden): bruges til budgetforslag.
//   * Medlemmer med login: adgang, roller, opgaver, kalender, lommepenge.
// Et barn behøver ikke et login for at tælle med, og et barn med login tæller
// aldrig to gange: familieoplysningerne er sandheden, og et barn med login kan
// kobles til sin post dér.

export type FamilyChild = { id: string; name: string; born_on: string; member_user_id: string | null }

/** Det, budgetmotoren får: {"adults": 2, "children": [{"age": 3}, {"age": 10}]} */
export type FamilyComposition = { adults: number; children: Array<{ age: number }> }

/** Fyldte år på en given dato */
export function ageOn(bornOn: string, on: Date): number {
  const [y, m, d] = bornOn.split('-').map(Number) as [number, number, number]
  let age = on.getFullYear() - y
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--
  return Math.max(age, 0)
}

/**
 * Sammensætningen ud fra familieoplysningerne. Antal voksne: det, familien har
 * sat – ellers antal voksne med login. Børn: kun dem i familieoplysningerne;
 * børn med login tælles ikke oveni (de kobles til deres post i stedet).
 */
export function familyComposition(input: { adults: number | null; adultLogins: number; children: FamilyChild[] }, on = new Date()): FamilyComposition {
  return {
    adults: input.adults ?? Math.max(input.adultLogins, 1),
    children: [...input.children].sort((a, b) => a.born_on.localeCompare(b.born_on)).map((c) => ({ age: ageOn(c.born_on, on) })),
  }
}

/** Børn med login, der endnu ikke står i familieoplysningerne (hjælp til at få dem med – uden dobbelttælling) */
export function unlinkedChildLogins<T extends { userId: string }>(childLogins: T[], children: FamilyChild[]): T[] {
  const linked = new Set(children.map((c) => c.member_user_id).filter(Boolean))
  return childLogins.filter((c) => !linked.has(c.userId))
}

const list = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}`)

/** "2 voksne · 2 børn (3 og 10 år)" */
export function describeFamily(f: FamilyComposition): string {
  const adults = `${f.adults} ${f.adults === 1 ? 'voksen' : 'voksne'}`
  if (f.children.length === 0) return `${adults} · ingen børn`
  const ages = list(f.children.map((c) => String(c.age)))
  return `${adults} · ${f.children.length} ${f.children.length === 1 ? 'barn' : 'børn'} (${ages} år)`
}
