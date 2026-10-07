// Dansk fortolker til OCR-tekst fra kvitteringer.
// Resultatet er altid et FORSLAG med en sikkerhed. Brugeren godkender altid.

export type Confidence = 'high' | 'medium' | 'low'

export type ParsedReceipt = {
  merchant: { value: string; confidence: Confidence } | null
  /** Usikkert butiksforslag (vises som "Forslag", udfyldes ikke automatisk) */
  merchantHint: string | null
  date: { value: string; confidence: Confidence } | null
  total: { ore: number; confidence: Confidence } | null
  /** Andre sandsynlige totaler (højst 3), mest sandsynlige først */
  alternatives: number[]
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
// Nøgleord for totalen, med vægt. Tåler typiske OCR-fejl (T0TAL, IOTAL, I AIT …).
const TOTAL_KEYWORDS: Array<[RegExp, number]> = [
  [/\bAT\s*BETALE\b/, 6],
  [/\b[TI1][O0ØQ]T[A4][L1I]T?\b/, 5],
  [/\bI\s*A[L1I]T\b|\bIA[L1I]T\b/, 5],
  // Betalingslinjer bekræfter totalen (betalt beløb = total ved kortbetaling)
  [/DANKORT|\bVISA\b|MASTER\s*CARD|MAESTRO|MOBILE\s*PAY|KORTBETALING|BETALINGSKORT|KREDITKORT|\bKORT\b|CONTACTLESS|APPLE\s*PAY|\bBETALT\b/, 3],
  [/\bBEL[ØO0]B\b|\bK[ØO0]B\b|K[ØO0]BSBEL[ØO0]B/, 3],
  [/\bSUM\b/, 2],
]
const STRONG = /\bAT\s*BETALE\b|\b[TI1][O0ØQ]T[A4][L1I]T?\b|\bI\s*A[L1I]T\b|\bIA[L1I]T\b/
// Linjer med beløb, der aldrig er totalen (moms, rabat, byttepenge, bonus, "sparet i år" …).
// Tåler OCR-fejl som MONS for MOMS.
const NOT_TOTAL =
  /SUBTOTAL|MELLEMSUM|\bM[O0][MN]S|RABAT|BESPAR|SPARE[TD]|BYTTEPENGE|RETUR|TILBAGE|MODTAGET|\bGIVET\b|POINT|BONUS|SALDO|\bI\s*[AÅ]R\b/
// Kun totalen, hvis linjen også siger TOTAL/I ALT ("TOTAL 12 STK", "TOTAL INKL. PANT").
// Ellers fx nettobeløb uden moms, antal varer eller pant alene.
const NOT_TOTAL_ALONE = /\bNETTO\b|ANTAL|STK\b|\bPANT\b/

// Beløb: "638,75", "1.234,50", "638.75", "638, 75". Kun punktum som tusindtalsseparator
// (mellemrum ville forveksle "antal 1 499,95" med 1.499,95). Ingen lookbehind (ældre iOS).
// Negative beløb (rabat) står som "-10,00" eller – hos fx Netto – "18,96-".
// Et tal lige efter et bogstav er ikke et beløb ("TOTA1. 37,95" er ikke 1,37).
const AMOUNT_RE = /(^|[^\d,.A-ZÆØÅa-zæøå])(-?)\s?(\d{1,3}(?:\.\d{3})+|\d+)\s?[,.;']\s?(\d{2})(?!\d)(?![.\-/]\d)(?!\s*%)(-?)/g

/** Retter typiske OCR-fejl i tal: O→0, l/I/|→1, S→5, B→8 – kun i "ord" der i forvejen indeholder cifre */
function fixDigits(s: string): string {
  return s.replace(/[\dOoIl|SB.,]+/g, (tok) =>
    (tok.match(/\d/g)?.length ?? 0) >= 2 ? tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8') : tok,
  )
}

/**
 * Bred skrift (fx TOTAL på Netto-bonner) læses ofte som "T O T A L 1 1 1 , 4 4".
 * Samler 3+ enkelttegn i træk – bogstaver for sig og tal for sig.
 */
function joinSpacedChars(s: string): string {
  const tokens = s.split(' ')
  const out: string[] = []
  let run: string[] = []
  let kind: 'letter' | 'digit' | null = null
  const flush = () => {
    if (run.length >= 3) out.push(run.join(''))
    else out.push(...run)
    run = []
    kind = null
  }
  for (const t of tokens) {
    const k = t.length === 1 ? (/[A-ZÆØÅ]/.test(t) ? 'letter' : /[\d,.]/.test(t) ? 'digit' : null) : null
    if (k && (kind === null || k === kind)) {
      run.push(t)
      kind = k
    } else {
      flush()
      if (k) {
        run.push(t)
        kind = k
      } else out.push(t)
    }
  }
  flush()
  return out.join(' ')
}

function normalizeLine(s: string): string {
  return joinSpacedChars(
    fixDigits(s)
      .toUpperCase()
      .replace(/[“”"'`´]/g, "'")
      // Fyldtegn mellem tekst og beløb: "TOTAL........111,44"
      .replace(/[._\-–—=*~:]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

/** Beløb uden decimaltegn på en totallinje: "TOTAL 111 44" → 11144 øre */
function looseAmount(line: string): number | null {
  const m = /(?:^|\s)(\d{1,5}) (\d{2})(?:\s*(?:DKK|KR\.?))?$/.exec(line)
  return m ? Number(m[1]) * 100 + Number(m[2]) : null
}

/** Linjer med kun et beløb (evt. med DKK/kr.) – typisk når beløbet står under/over TOTAL */
const AMOUNT_ONLY = /^(?:DKK|KR\.?)?\s*-?\d[\d.]*\s?[,.;']\s?\d{2}-?\s*(?:DKK|KR\.?)?$/

function signedAmounts(line: string): number[] {
  const out: number[] = []
  for (const m of fixDigits(line).matchAll(AMOUNT_RE)) {
    const whole = m[3]!.replace(/\./g, '')
    const ore = Number(whole) * 100 + Number(m[4])
    if (Number.isFinite(ore) && ore > 0 && ore < 10_000_000_00) out.push(m[2] || m[5] ? -ore : ore)
  }
  return out
}

/** Alle beløb i en linje, i øre (uden fortegn) */
export function amountsInLine(line: string): number[] {
  return signedAmounts(line).map(Math.abs)
}

function isExcluded(line: string) {
  return NOT_TOTAL.test(line) || (NOT_TOTAL_ALONE.test(line) && !STRONG.test(line))
}

function findTotal(lines: string[]): { total: ParsedReceipt['total']; alternatives: number[] } {
  // Beløb → bedste nøgleordsvægt og antal forskellige nøgleordslinjer
  const keyword = new Map<number, { prio: number; lines: number; first: number }>()
  const counts = new Map<number, number>()
  let firstKeywordLine = -1

  lines.forEach((line, i) => {
    if (isExcluded(line)) return
    const amounts = amountsInLine(line)
    for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1)
    const hit = TOTAL_KEYWORDS.find(([re]) => re.test(line))
    if (!hit) return
    // Beløbet står normalt på samme linje; ellers på en af de næste linjer (højst 3 frem,
    // forbi linjer uden beløb som "DKK"), et beløb uden komma ("111 44") eller linjen over
    let found = amounts
    if (found.length === 0) {
      const loose = looseAmount(line)
      if (loose && hit[1] >= 5) found = [loose]
    }
    for (let j = i + 1; found.length === 0 && j < Math.min(lines.length, i + 4); j++) {
      if (isExcluded(lines[j]!)) break
      found = amountsInLine(lines[j]!)
      if (found.length === 0 && TOTAL_KEYWORDS.some(([re]) => re.test(lines[j]!))) break
    }
    if (found.length === 0 && i > 0 && AMOUNT_ONLY.test(lines[i - 1]!)) found = amountsInLine(lines[i - 1]!)
    const a = found.at(-1)
    if (a === undefined) return
    if (firstKeywordLine < 0 && hit[1] >= 5) firstKeywordLine = i
    const cur = keyword.get(a)
    keyword.set(a, { prio: Math.max(cur?.prio ?? 0, hit[1]), lines: (cur?.lines ?? 0) + 1, first: cur?.first ?? i })
  })

  // Summen af varelinjerne før totalen (sidste beløb pr. linje, rabatter trækkes fra)
  let itemSum = 0
  const sumEnd = firstKeywordLine >= 0 ? firstKeywordLine : lines.length
  for (const line of lines.slice(0, sumEnd)) {
    if (/SUBTOTAL|MELLEMSUM|\bM[O0][MN]S/.test(line)) continue
    const a = signedAmounts(line).at(-1)
    if (a !== undefined) itemSum += a
  }

  const scored = [...keyword.entries()].map(([ore, k]) => {
    let score = k.prio + 1.5 * (k.lines - 1) + ((counts.get(ore) ?? 0) >= 2 ? 1 : 0)
    if (itemSum > 0 && itemSum === ore) score += 2
    return { ore, score, prio: k.prio, corroborated: k.lines >= 2 || (counts.get(ore) ?? 0) >= 2 || itemSum === ore }
  })
  scored.sort((a, b) => b.score - a.score || b.ore - a.ore)

  const all = [...counts.keys()]
  // Andre sandsynlige beløb, som brugeren kan vælge med ét tryk
  const others = (chosen: number) => {
    const repeated = all.filter((a) => (counts.get(a) ?? 0) >= 2).sort((a, b) => b - a)
    const largest = [...all].sort((a, b) => b - a)
    return [...new Set([...scored.map((c) => c.ore), ...repeated, ...largest])].filter((a) => a !== chosen).slice(0, 3)
  }

  const best = scored[0]
  if (best) {
    const isMax = best.ore >= Math.max(...all)
    const confidence: Confidence = best.prio >= 5 && best.corroborated && isMax ? 'high' : (best.prio >= 5 && isMax) || best.corroborated ? 'medium' : 'low'
    return { total: { ore: best.ore, confidence }, alternatives: others(best.ore) }
  }
  if (all.length === 0) return { total: null, alternatives: [] }
  // Uden nøgleord: største beløb der står flere gange (typisk total + betaling), ellers største
  const repeated = all.filter((a) => (counts.get(a) ?? 0) >= 2)
  const ore = Math.max(...(repeated.length ? repeated : all))
  return { total: { ore, confidence: repeated.length ? 'medium' : 'low' }, alternatives: others(ore) }
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
  // Netto/Salling: "1086 06 10 26 19:14" (dag måned år med mellemrum, efterfulgt af klokkeslæt)
  for (const m of t.matchAll(/(^|\D)(\d{2}) (\d{2}) (\d{2}) {1,3}\d{1,2}[:.]\d{2}(?!\d)/g)) {
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
  // Den kæde der står først (fx "REMA 1000" øverst og "NETTO 99,16" i momslinjen)
  const inHead = CHAINS.map(([name, re]) => ({ name, at: head.search(re) })).filter((c) => c.at >= 0).sort((a, b) => a.at - b.at)[0]
  if (inHead) return { merchant: { value: inHead.name, confidence: 'high' }, merchantHint: null }
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
  const { total, alternatives } = findTotal(lines)
  return {
    ...findMerchant(lines),
    date: findDate(text, today),
    total,
    alternatives,
  }
}
