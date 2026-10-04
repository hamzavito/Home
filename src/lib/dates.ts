// Danske datoformater. Alle visninger går gennem disse funktioner.
const TZ = 'Europe/Copenhagen'

const monthYear = new Intl.DateTimeFormat('da-DK', { month: 'long', year: 'numeric', timeZone: TZ })
const monthOnly = new Intl.DateTimeFormat('da-DK', { month: 'long', timeZone: TZ })
const short = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', timeZone: TZ })
const long = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
const weekdayLong = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })

/** "oktober" */
export const formatMonth = (d: Date) => monthOnly.format(d)
/** "oktober 2026" */
export const formatMonthYear = (d: Date) => monthYear.format(d)
/** "18. okt." */
export const formatShortDate = (d: Date) => short.format(d)
/** "4. oktober 2026" */
export const formatLongDate = (d: Date) => long.format(d)
/** "søndag den 4. oktober" */
export const formatWeekday = (d: Date) => weekdayLong.format(d).replace(/^(\p{L}+)\s/u, '$1 den ')

/** Postgres date ("2026-10-04") → Date ved middag lokal tid (undgår tidszone-skift) */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12)
}

/** Date → Postgres date ("2026-10-04") i lokal tid */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Første dag i måneden som Postgres date ("2026-10-01") */
export function monthKey(d: Date): string {
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1, 12))
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'God nat'
  if (h < 10) return 'God morgen'
  if (h < 18) return 'Goddag'
  return 'God aften'
}

/** "I dag", "I går" eller "18. okt." */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const todayIso = toIsoDate(now)
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
  if (iso === todayIso) return 'I dag'
  if (iso === toIsoDate(y)) return 'I går'
  return formatShortDate(fromIsoDate(iso))
}

/** Overskrift for en dag i en liste: "I dag", "I går" eller "lørdag 3. okt." */
const dayHeading = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ })
export function dayLabel(iso: string, now: Date = new Date()): string {
  const r = relativeDay(iso, now)
  if (r === 'I dag' || r === 'I går') return r
  const s = dayHeading.format(fromIsoDate(iso)).replace(',', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
