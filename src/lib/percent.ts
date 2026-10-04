// Procenter gemmes som basispoint (1 % = 100 bp), så 32,5 % = 3250 – ingen kommatal i databasen.

/** "65" → 6500 · "32,5" → 3250 · "100 %" → 10000. Null ved ugyldigt eller over 100 %. */
export function parsePercent(input: string): number | null {
  const s = input.replace('%', '').replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null
  const bp = Math.round(Number(s) * 100)
  return bp >= 0 && bp <= 10000 ? bp : null
}

/** 6500 → "65 %" · 3250 → "32,5 %" */
export function formatPercent(bp: number): string {
  const v = bp / 100
  return `${Number.isInteger(v) ? v : v.toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`
}

/** Til inputfelt: 3250 → "32,5" */
export function percentInputValue(bp: number): string {
  const v = bp / 100
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
}
