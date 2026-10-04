// Dansk fortolker til OCR-tekst fra kvitteringer.
// Resultatet er altid et FORSLAG med en sikkerhed. Brugeren godkender altid.

export type Confidence = 'high' | 'medium' | 'low'

export type ParsedReceipt = {
  merchant: { value: string; confidence: Confidence } | null
  /** Usikkert butiksforslag (vises som "Forslag", udfyldes ikke automatisk) */
  merchantHint: string | null
  date: { value: string; confidence: Confidence } | null
  total: { ore: number; confidence: Confidence } | null
}

// ------------------------------------------------------------------ butikker
// Kendte danske kæder: [visningsnavn, mønstre i normaliseret OCR-tekst]
const CHAINS: Array<[string, RegExp]> = [
  ['Netto', /\bNETTO\b/],
  ['Føtex', /\bF[ØO0]TEX\b/],
  ['Bilka', /\bBILKA\b/],
  ['Rema 1000', /\bREMA\s*1[O0]{3}\b|\bREMA\b/],
  ['Lidl', /\bLIDL\b/],
  ['Coop 365', /\bCOOP\s*365\b|\b365\s*DISCOUNT\b/],
  ['Kvickly', /\bKVICKLY\b/],
  ['SuperBrugsen', /\bSUPER\s*BRUGSEN\b/],
  ["Dagli'Brugsen", /\bDAGLI.?\s*BRUGSEN\b/],
  ['Brugsen', /\bBRUGSEN\b/],
  ['Meny', /\bMENY\b/],
  ['Spar', /\bSPAR\b/],
  ['Løvbjerg', /\bL[ØO0]VBJERG\b/],
  ['Min Købmand', /\bMIN\s*K[ØO0]BMAND\b/],
  ['Irma', /\bIRMA\b/],
  ['7-Eleven', /\b7\s*-?\s*ELEVEN\b/],
  ['Circle K', /\bCIRCLE\s*K\b/],
  ['Q8', /\bQ8\b/],
  ['Shell', /\bSHELL\b/],
  ['Normal', /\bNORMAL\b/],
  ['Matas', /\bMATAS\b/],
  ['Søstrene Grene', /\bS[ØO0]STRENE\s*GRENE\b/],
  ['Flying Tiger', /\bFLYING\s*TIGER\b/],
  ['IKEA', /\bIKEA\b/],
  ['JYSK', /\bJYSK\b/],
  ['Bauhaus', /\bBAUHAUS\b/],
  ['Silvan', /\bSILVAN\b/],
  ['Harald Nyborg', /\bHARALD\s*NYBORG\b/],
  ['Elgiganten', /\bELGIGANTEN\b/],
  ['Power', /\bPOWER\b/],
  ['Apotek', /\bAPOTEK\b/],
  ['H&M', /\bH\s*&\s*M\b/],
  ['Salling', /\bSALLING\b/],
  ['Fakta', /\bFAKTA\b/],
  ['Aldi', /\bALDI\b/],
  ['Lagkagehuset', /\bLAGKAGEHUSET\b/],
  ['Joe & The Juice', /\bJOE\s*&?\s*THE\s*JUICE\b/],
  ["McDonald's", /\bMC\s*DONALD/],
]

// Linjer der ikke er et butiksnavn
const NOT_MERCHANT = /CVR|TLF|TEL\b|MOMS|KVITTERING|BON\b|KASSE|EKSPEDIENT|WWW|HTTP|@|VEJ\b|GADE\b|ALLE\b|PLADS\b|\d{4}\s+[A-ZÆØÅ]/

// ------------------------------------------------------------------ beløb
// Nøgleord for totalen, med prioritet (højere = stærkere)
const TOTAL_KEYWORDS: Array<[RegExp, number]> = [
  [/\bAT\s*BETALE\b/, 5],
  [/\bTOTALT?\b/, 4],
  [/\bI\s*ALT\b|\bIALT\b/, 4],
  [/\bBEL[ØO0]B\b/, 3],
  [/\bSUM\b/, 2],
]
// Linjer der ligner totalen, men ikke er det
const NOT_TOTAL = /SUBTOTAL|MOMS|RABAT|BESPAR|BYTTEPENGE|RETUR|TILBAGE|PANT|ANTAL|STK\b|KONTANT\s*MODTAGET|POINT/

// Beløb: "638,75", "1.234,50", "638.75", "638, 75". Kun punktum som tusindtalsseparator
// (mellemrum ville forveksle "antal 1 499,95" med 1.499,95). Ingen lookbehind (ældre iOS).
const AMOUNT_RE = /(^|[^\d,.])(\d{1,3}(?:\.\d{3})+|\d+)\s?[,.]\s?(\d{2})(?!\d)(?![.\-/]\d)(?!\s*%)/g

/** Retter typiske OCR-fejl i tal: O→0 og l/I/|→1 – kun i "ord" der i forvejen indeholder cifre */
function fixDigits(s: string): string {
  return s.replace(/[\dOoIl|.,]+/g, (tok) => ((tok.match(/\d/g)?.length ?? 0) >= 2 ? tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : tok))
}

function normalizeLine(s: string): string {
  return fixDigits(s)
    .toUpperCase()
    .replace(/[“”"']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Alle beløb i en linje, i øre */
export function amountsInLine(line: string): number[] {
  const out: number[] = []
  for (const m of fixDigits(line).matchAll(AMOUNT_RE)) {
    const whole = m[2]!.replace(/\./g, '')
    const ore = Number(whole) * 100 + Number(m[3])
    if (Number.isFinite(ore) && ore > 0 && ore < 10_000_000_00) out.push(ore)
  }
  return out
}

function findTotal(lines: string[]): ParsedReceipt['total'] {
  type Cand = { ore: number; prio: number; index: number }
  const cands: Cand[] = []
  const all: number[] = []

  lines.forEach((line, i) => {
    const amounts = amountsInLine(line)
    // Byttepenge, kontant modtaget, moms osv. tæller ikke med i sammenligningen
    if (NOT_TOTAL.test(line)) return
    all.push(...amounts)
    for (const [re, prio] of TOTAL_KEYWORDS) {
      if (!re.test(line)) continue
      // Beløbet står normalt på samme linje; ellers på næste linje
      let found = amounts
      if (found.length === 0 && i + 1 < lines.length && !NOT_TOTAL.test(lines[i + 1]!)) found = amountsInLine(lines[i + 1]!)
      if (found.length > 0) cands.push({ ore: found.at(-1)!, prio, index: i })
      break
    }
  })

  if (cands.length === 0) {
    if (all.length === 0) return null
    // Fallback: største beløb på kvitteringen – altid lav sikkerhed
    return { ore: Math.max(...all), confidence: 'low' }
  }

  const bestPrio = Math.max(...cands.map((c) => c.prio))
  const top = cands.filter((c) => c.prio === bestPrio)
  // Ved flere kandidater med samme prioritet: det beløb der går igen flest gange, ellers det største
  const counts = new Map<number, number>()
  for (const c of cands) counts.set(c.ore, (counts.get(c.ore) ?? 0) + 1)
  const chosen = [...top].sort((a, b) => (counts.get(b.ore)! - counts.get(a.ore)!) || b.ore - a.ore)[0]!

  const occurrences = all.filter((a) => a === chosen.ore).length
  const isMax = chosen.ore >= Math.max(...all)
  const corroborated = occurrences >= 2 || (counts.get(chosen.ore) ?? 0) >= 2
  const confidence: Confidence = corroborated && isMax ? 'high' : isMax || corroborated ? 'medium' : 'low'
  return { ore: chosen.ore, confidence }
}

// ------------------------------------------------------------------ dato
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAJ: 5, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, DEC: 12,
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  const dt = new Date(y, m - 1, d, 12)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function findDate(text: string, today: Date): ParsedReceipt['date'] {
  const found: string[] = []
  const t = fixDigits(text).toUpperCase()
  // 04.10.2026 · 04-10-26 · 4/10/2026
  for (const m of t.matchAll(/(^|\D)(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{4}|\d{2})(?!\d)/g)) {
    const v = validDate(Number(m[4]), Number(m[3]), Number(m[2]))
    if (v) found.push(v)
  }
  // 2026-10-04
  for (const m of t.matchAll(/(^|\D)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g)) {
    const v = validDate(Number(m[2]), Number(m[3]), Number(m[4]))
    if (v) found.push(v)
  }
  // 4. okt 2026 · 4 OKT. 26
  for (const m of t.matchAll(/(^|\D)(\d{1,2})\.?\s?(JAN|FEB|MAR|APR|MAJ|MAY|JUN|JUL|AUG|SEP|OKT|OCT|NOV|DEC)[A-Z]*\.?\s?(\d{4}|\d{2})(?!\d)/g)) {
    const v = validDate(Number(m[4]), MONTHS[m[3]!]!, Number(m[2]))
    if (v) found.push(v)
  }

  // Kun rimelige datoer: ikke i fremtiden (+1 dag tolerance) og højst 2 år gamle
  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 23)
  const min = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
  const plausible = found.filter((iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(y!, m! - 1, d!, 12)
    return dt <= max && dt >= min
  })
  if (plausible.length === 0) return null
  const distinct = [...new Set(plausible)]
  if (distinct.length === 1) return { value: distinct[0]!, confidence: 'high' }
  // Flere forskellige datoer: tag den hyppigste (ellers den første)
  const counts = new Map<string, number>()
  for (const d of plausible) counts.set(d, (counts.get(d) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  return { value: best, confidence: 'medium' }
}

// ------------------------------------------------------------------ butik
function findMerchant(lines: string[]): Pick<ParsedReceipt, 'merchant' | 'merchantHint'> {
  const head = lines.slice(0, 8).join(' ')
  const whole = lines.join(' ')
  for (const [name, re] of CHAINS) {
    if (re.test(head)) return { merchant: { value: name, confidence: 'high' }, merchantHint: null }
  }
  for (const [name, re] of CHAINS) {
    if (re.test(whole)) return { merchant: { value: name, confidence: 'medium' }, merchantHint: null }
  }
  // Ukendt butik: første "navneagtige" linje som forslag (udfyldes ikke automatisk)
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^A-ZÆØÅ]/g, '')
    if (letters.length < 3 || NOT_MERCHANT.test(line) || amountsInLine(line).length > 0) continue
    if (letters.length / line.replace(/\s/g, '').length < 0.7) continue
    const pretty = line
      .toLowerCase()
      .replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
      .slice(0, 40)
    return { merchant: null, merchantHint: pretty }
  }
  return { merchant: null, merchantHint: null }
}

// ------------------------------------------------------------------ samlet
export function parseReceiptText(text: string, today: Date = new Date()): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length > 0)
  return {
    ...findMerchant(lines),
    date: findDate(text, today),
    total: findTotal(lines),
  }
}
