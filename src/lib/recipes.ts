// Madplan og opskrifter: enheder, mængder, skalering, sammenlægning af ingredienser og uger.
// Mængder er heltal i tusindedele (milli): 0,5 → 500 · 700 g → 700000 (som i databasen).
import { fromIsoDate, toIsoDate } from './dates'
import { addDaysIso } from './home'

export const UNITS = ['g', 'kg', 'ml', 'dl', 'l', 'stk', 'spsk', 'tsk', 'fed', 'dåse', 'pakke', 'pose', 'bundt', 'skive', 'knsp'] as const
export type Unit = (typeof UNITS)[number]

/** Kun vægt og rumfang kan omregnes sikkert. Alt andet lægges kun sammen med samme enhed. */
const CONVERT: Partial<Record<Unit, { family: 'vægt' | 'rumfang'; base: 'g' | 'ml'; factor: number }>> = {
  g: { family: 'vægt', base: 'g', factor: 1 },
  kg: { family: 'vægt', base: 'g', factor: 1000 },
  ml: { family: 'rumfang', base: 'ml', factor: 1 },
  dl: { family: 'rumfang', base: 'ml', factor: 100 },
  l: { family: 'rumfang', base: 'ml', factor: 1000 },
}

export function isUnit(u: unknown): u is Unit {
  return typeof u === 'string' && (UNITS as readonly string[]).includes(u)
}

// ------------------------------------------------------------------ mængder
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

/** "1,5" · "1.5" · "½" · "1 ½" · "1/2" → milli. Tom = null. Ugyldig = undefined. */
export function parseAmount(input: string): number | null | undefined {
  const s = input.trim().replace(/\s+/g, ' ')
  if (!s) return null
  let value: number | undefined
  const frac = /^(?:(\d+) ?)?([½¼¾⅓⅔])$/.exec(s)
  const slash = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(s)
  if (frac) value = Number(frac[1] ?? 0) + FRACTIONS[frac[2]!]!
  else if (slash && Number(slash[3]) > 0) value = Number(slash[1] ?? 0) + Number(slash[2]) / Number(slash[3])
  else if (/^\d+([.,]\d+)?$/.test(s)) value = Number(s.replace(',', '.'))
  if (value === undefined || !Number.isFinite(value) || value <= 0 || value > 100_000) return undefined
  return Math.round(value * 1000)
}

const num = (max: number) => new Intl.NumberFormat('da-DK', { maximumFractionDigits: max, useGrouping: false })

/** 1500 → "1,5" · 333 → "0,33" · 700000 → "700" */
export function formatAmount(milli: number): string {
  const v = milli / 1000
  return num(v >= 100 ? 0 : v >= 10 ? 1 : 2).format(v)
}

/** Skaler en mængde fra opskriftens portioner til de ønskede */
export function scaleMilli(milli: number, from: number, to: number): number {
  if (from <= 0) return milli
  return Math.round((milli * to) / from)
}

/** Vis mængde + enhed. Gram og milliliter skifter til kg/l, når det er pænest. */
export function formatQuantity(milli: number | null, unit: Unit | null): string {
  if (milli === null) return unit && unit !== 'stk' ? unit : ''
  const conv = unit ? CONVERT[unit] : undefined
  if (conv) {
    const base = (milli * conv.factor) / 1000 // i g eller ml
    if (conv.base === 'g') return base >= 1000 ? `${formatAmount(base)} kg` : `${num(0).format(Math.round(base))} g`
    if (base >= 1000) return `${formatAmount(base)} l`
    if (base >= 100 && base % 100 === 0) return `${num(1).format(base / 100)} dl`
    return `${num(0).format(Math.round(base))} ml`
  }
  return unit ? `${formatAmount(milli)} ${unit}` : formatAmount(milli)
}

// ------------------------------------------------------------------ sammenlægning
export type IngredientLike = { name: string; amount_milli: number | null; unit: string | null }

/** Navn til sammenligning: små bogstaver, ét mellemrum */
export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ')
}

export type MergedIngredient = {
  /** Stabil nøgle for ingrediens + enhedstype (bruges mod dubletter på indkøbslisten) */
  key: string
  name: string
  quantity: string
  /** Hvilke retter ingrediensen kommer fra */
  from: string[]
}

/**
 * Lægger ens ingredienser sammen: samme navn og enhed der kan omregnes sikkert
 * (g+kg, ml+dl+l, stk+stk …). Kan det ikke, bliver de separate linjer i stedet for et gæt.
 * En ingrediens uden mængde (fx "salt") falder bort, hvis samme ingrediens også har en mængde.
 */
export function mergeIngredients(items: Array<IngredientLike & { from?: string }>): MergedIngredient[] {
  type Group = { key: string; name: string; milli: number | null; unit: Unit | null; from: string[]; order: number }
  const groups = new Map<string, Group>()
  let order = 0
  for (const it of items) {
    const norm = normalizeName(it.name)
    if (!norm) continue
    const unit = isUnit(it.unit) ? it.unit : null
    const conv = unit ? CONVERT[unit] : undefined
    const kind = it.amount_milli === null ? 'uden-mængde' : conv ? conv.family : (unit ?? 'antal')
    const key = `${norm}|${kind}`
    const amount = it.amount_milli === null ? null : conv ? it.amount_milli * conv.factor : it.amount_milli
    const g = groups.get(key)
    if (g) {
      if (amount !== null) g.milli = (g.milli ?? 0) + amount
      if (it.from && !g.from.includes(it.from)) g.from.push(it.from)
    } else {
      groups.set(key, { key, name: it.name.trim(), milli: amount, unit: conv ? conv.base : unit, from: it.from ? [it.from] : [], order: order++ })
    }
  }
  const withAmount = new Set([...groups.values()].filter((g) => g.milli !== null).map((g) => g.key.split('|')[0]))
  return [...groups.values()]
    .filter((g) => g.milli !== null || !withAmount.has(g.key.split('|')[0]))
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ key: g.key, name: g.name, quantity: formatQuantity(g.milli, g.unit), from: g.from }))
}

/** Ting de fleste har hjemme – foreslås som "har vi" (kan ændres) */
const PANTRY = new Set(['salt', 'peber', 'vand', 'olie', 'olivenolie', 'rapsolie', 'sukker', 'mel', 'hvedemel'])
export function isPantryStaple(name: string) {
  return PANTRY.has(normalizeName(name))
}

// ------------------------------------------------------------------ uger
/** Mandag i ugen for en dato (YYYY-MM-DD) */
export function weekStart(iso: string): string {
  const d = fromIsoDate(iso)
  const dow = (d.getDay() + 6) % 7 // man = 0
  d.setDate(d.getDate() - dow)
  return toIsoDate(d)
}

/** ISO-ugenummer (dansk ugenummerering) */
export function isoWeek(iso: string): number {
  const [y, m, day] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1, day!))
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow) // torsdag i samme uge
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
}

export const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'] as const

const shortDate = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' })
/** "Uge 41 · 5.–11. okt." */
export function weekLabel(monday: string): string {
  const sunday = addDaysIso(monday, 6)
  const a = fromIsoDate(monday)
  const b = fromIsoDate(sunday)
  const range = a.getMonth() === b.getMonth() ? `${a.getDate()}.–${shortDate.format(b)}` : `${shortDate.format(a)} – ${shortDate.format(b)}`
  return `Uge ${isoWeek(monday)} · ${range}`
}

// ------------------------------------------------------------------ kategorier og tags
/** Forslag – husstandens egne kategorier/tags kommer oveni */
export const CATEGORY_SUGGESTIONS = ['Kylling', 'Oksekød', 'Fisk', 'Vegetar', 'Pasta', 'Ris', 'Suppe', 'Morgenmad', 'Madpakke', 'Andet']
export const TAG_SUGGESTIONS = ['Børnevenlig', 'Madpakke-egnet', 'Hurtig', 'Fryseegnet', 'Halal']

/** Forslag + det husstanden allerede bruger, uden dubletter (uanset store/små bogstaver) */
export function withSuggestions(suggestions: string[], used: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of [...suggestions, ...used]) {
    const k = normalizeName(v)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(v.trim())
  }
  return out
}

/** Rens et tag: trim, ét mellemrum, højst 30 tegn */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 30).trim()
}

// ------------------------------------------------------------------ ingredienslinjer (fra links)
// Danske og engelske stavemåder → appens enheder
const UNIT_WORDS: Array<[RegExp, Unit]> = [
  [/^(g|gr|gram|grams?)\.?$/i, 'g'],
  [/^(kg|kilo|kilogram)\.?$/i, 'kg'],
  [/^(ml|milliliter)\.?$/i, 'ml'],
  [/^(dl|deciliter)\.?$/i, 'dl'],
  [/^(l|ltr|liter|litre)\.?$/i, 'l'],
  [/^(stk|styk|stykker|pcs)\.?$/i, 'stk'],
  [/^(spsk|spiseske|spiseskeer|spsk\.|tbsp|el)\.?$/i, 'spsk'],
  [/^(tsk|teske|teskeer|tsp|tl)\.?$/i, 'tsk'],
  [/^(fed)$/i, 'fed'],
  [/^(dåse|dåser|ds)\.?$/i, 'dåse'],
  [/^(pakke|pakker|pk)\.?$/i, 'pakke'],
  [/^(pose|poser)$/i, 'pose'],
  [/^(bundt|bundter|bdt)\.?$/i, 'bundt'],
  [/^(skive|skiver)$/i, 'skive'],
  [/^(knsp|knivspids|knivsspids)\.?$/i, 'knsp'],
]

export type ParsedIngredient = { name: string; amount_milli: number | null; unit: Unit | null; note: string | null }

/**
 * "700 g kyllingebryst" · "2 løg, hakket" · "½ tsk salt" · "1,5 dl fløde" · "2-3 fed hvidløg" · "Salt og peber".
 * Kan mængden ikke læses sikkert, bliver hele linjen navnet (intet gæt).
 */
export function parseIngredientLine(line: string): ParsedIngredient {
  let s = line.replace(/\s+/g, ' ').replace(/^[-•*·]\s*/, '').trim()
  let note: string | null = null
  // "(ca. 400 g)" og alt efter første komma er en note
  const paren = /\s*\(([^)]*)\)\s*/.exec(s)
  if (paren) {
    note = paren[1]!.trim() || null
    s = (s.slice(0, paren.index) + ' ' + s.slice(paren.index + paren[0].length)).trim()
  }
  // Første komma der ikke er et decimalkomma (1,5 dl)
  const comma = [...s].findIndex((ch, i) => ch === ',' && !(/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? '')))
  if (comma > 0) {
    const rest = s.slice(comma + 1).trim()
    s = s.slice(0, comma).trim()
    note = [rest, note].filter(Boolean).join(' – ') || null
  }
  s = s.replace(/^ca\.?\s+/i, '')

  // Mængde: tal, decimal, brøk, "1 ½", interval "2-3" (første tal bruges)
  const m = /^(\d+(?:[.,]\d+)?(?:\s?[½¼¾⅓⅔])?|[½¼¾⅓⅔]|\d+\/\d+|\d+ \d+\/\d+)(?:\s?[-–]\s?\d+(?:[.,]\d+)?)?\s*(.*)$/.exec(s)
  if (!m) return { name: cap(s), amount_milli: null, unit: null, note }
  const amount = parseAmount(m[1]!.replace(/(\d)([½¼¾⅓⅔])/, '$1 $2'))
  if (amount === undefined || amount === null) return { name: cap(s), amount_milli: null, unit: null, note }
  let rest = m[2]!.trim()
  let unit: Unit | null = null
  // Første ord er enheden, hvis det er en kendt enhed ("500g" virker også – tallet er allerede taget)
  const word = [rest.split(' ')[0] ?? '', rest.split(' ').slice(1).join(' ')]
  const hit = UNIT_WORDS.find(([re]) => re.test(word[0]!))
  if (hit && word[1]) {
    unit = hit[1]
    rest = word[1].trim()
  }
  if (!rest) return { name: cap(s), amount_milli: null, unit: null, note }
  return { name: cap(rest), amount_milli: amount, unit: unit ?? 'stk', note }
}

function cap(s: string) {
  const t = s.trim()
  return t.charAt(0).toLocaleUpperCase('da-DK') + t.slice(1)
}
