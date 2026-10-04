// Opbevaringstid for kvitteringsbilleder. Spejler private.receipt_delete_at() i databasen.
import { formatLongDate, fromIsoDate, toIsoDate } from './dates'

export type Retention = '30d' | '3m' | '6m' | '1y' | 'custom' | 'permanent'

export const retentionOptions: Array<{ value: Retention; label: string }> = [
  { value: '30d', label: '30 dage' },
  { value: '3m', label: '3 måneder' },
  { value: '6m', label: '6 måneder' },
  { value: '1y', label: '1 år' },
  { value: 'custom', label: 'Vælg dato' },
  { value: 'permanent', label: 'Behold permanent' },
]

export const DEFAULT_RETENTION: Retention = '30d'

/** Læg måneder til som Postgres: 31. jan + 1 md = 28./29. feb (ingen overløb) */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y!, m! - 1 + months, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d!, lastDay))
  return toIsoDate(target)
}

function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

/** Sletningsdato (YYYY-MM-DD) eller null ved permanent. */
export function deleteDateFor(retention: Retention, baseIso: string, customIso?: string | null): string | null {
  switch (retention) {
    case '30d':
      return addDays(baseIso, 30)
    case '3m':
      return addMonthsClamped(baseIso, 3)
    case '6m':
      return addMonthsClamped(baseIso, 6)
    case '1y':
      return addMonthsClamped(baseIso, 12)
    case 'custom':
      return customIso ?? null
    case 'permanent':
      return null
  }
}

const dkDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' })

/** timestamptz fra databasen → dato i dansk tid (YYYY-MM-DD) */
export function toDkIsoDate(ts: string | Date): string {
  return dkDate.format(typeof ts === 'string' ? new Date(ts) : ts)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime()) / 86_400_000)
}

/** Kort status til lister: "24 dage tilbage", "Slettes i morgen", "Beholdes permanent" … */
export function retentionBadge(r: { deleteAt: string | null; imageDeletedAt: string | null }, todayIso = toIsoDate(new Date())): string {
  if (r.imageDeletedAt) return 'Billede slettet'
  if (!r.deleteAt) return 'Beholdes permanent'
  const days = daysBetween(todayIso, toDkIsoDate(r.deleteAt))
  if (days <= 0) return 'Slettes i nat'
  if (days === 1) return 'Slettes i morgen'
  return `${days} dage tilbage`
}

/** Hel sætning til detaljevisning og valg af opbevaring */
export function retentionSentence(deleteIso: string | null): string {
  if (!deleteIso) return 'Kvitteringsbilledet beholdes permanent.'
  return `Kvitteringen slettes automatisk ${formatLongDate(fromIsoDate(deleteIso))}.`
}
