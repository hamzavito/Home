// Beløb gemmes altid som heltal i øre (bigint i databasen).
// 638,75 kr. = 63875 øre.

const kr = new Intl.NumberFormat('da-DK', {
  style: 'currency',
  currency: 'DKK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const krWhole = new Intl.NumberFormat('da-DK', {
  style: 'currency',
  currency: 'DKK',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 63875 → "638,75 kr." · 1200000 → "12.000 kr." (hele kroner vises uden decimaler) */
export function formatKr(ore: number, opts: { decimals?: 'auto' | 'always' | 'never' } = {}): string {
  const decimals = opts.decimals ?? 'auto'
  const value = ore / 100
  const useWhole = decimals === 'never' || (decimals === 'auto' && ore % 100 === 0)
  return (useWhole ? krWhole : kr).format(useWhole ? Math.round(value) : value)
}

const plain = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const plain2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Kun tallet, uden "kr.": 63875 → "638,75" · 1245000 → "12.450" */
export function formatAmount(ore: number, opts: { decimals?: 'auto' | 'always' | 'never' } = {}): string {
  const decimals = opts.decimals ?? 'auto'
  const abs = Math.abs(ore)
  if (decimals === 'never' || (decimals === 'auto' && abs % 100 === 0)) return plain.format(Math.round(abs / 100))
  return plain2.format(abs / 100)
}

/** Til inputfelter: 63875 → "638,75" · 500000 → "5000" */
export function toInputValue(ore: number): string {
  const kr = Math.floor(Math.abs(ore) / 100)
  const rest = Math.abs(ore) % 100
  return rest === 0 ? String(kr) : `${kr},${String(rest).padStart(2, '0')}`
}

/**
 * Fortolker et beløb skrevet på dansk: "638,75", "1.234,50", "1234", "12 000 kr."
 * Returnerer øre eller null, hvis teksten ikke er et gyldigt beløb.
 */
export function parseKr(input: string): number | null {
  const cleaned = input.replace(/kr\.?|dkk/gi, '').replace(/[\s\u00a0]/g, '').trim()
  if (!cleaned) return null
  // Dansk format: punktum som tusindtalsseparator, komma som decimal.
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(cleaned)) return null
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}
