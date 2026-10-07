// Faste lommepenge: samme regler som i databasen (private.allowance_due_dates m.fl.),
// her til visning af "næste udbetaling" og beskrivelser.
import type { AllowanceFrequency, RewardStatus } from '@/types/database'
import { addDaysIso } from './home'

export type AllowanceLike = {
  frequency: AllowanceFrequency
  weekday: number | null
  month_day: number | null
  start_on: string
  end_on: string | null
  pay_from: string
  paused_at: string | null
  stopped_at: string | null
}

export const weekdayNames = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'] as const

/** "Hver fredag" · "Den 1. i hver måned" · "Sidste dag i hver måned" */
export function describeAllowance(s: Pick<AllowanceLike, 'frequency' | 'weekday' | 'month_day'>): string {
  if (s.frequency === 'weekly') return `Hver ${weekdayNames[(s.weekday ?? 1) - 1]}`
  if (!s.month_day) return 'Sidste dag i hver måned'
  return `Den ${s.month_day}. i hver måned`
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}
const lastDayOfMonth = (iso: string) => {
  const d = parse(iso)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}
/** ISO-ugedag: 1 = mandag … 7 = søndag */
export const isoWeekday = (iso: string) => ((parse(iso).getUTCDay() + 6) % 7) + 1

export function isDueOn(s: Pick<AllowanceLike, 'frequency' | 'weekday' | 'month_day'>, iso: string): boolean {
  if (s.frequency === 'weekly') return isoWeekday(iso) === s.weekday
  const day = Number(iso.slice(8, 10))
  const last = lastDayOfMonth(iso)
  const target = !s.month_day ? last : Math.min(s.month_day, last)
  return day === target
}

/** Periode-nøgle som i databasen: "2026-W41" (ISO-uge) eller "2026-10" */
export function periodKey(frequency: AllowanceFrequency, iso: string): string {
  if (frequency === 'monthly') return iso.slice(0, 7)
  const d = parse(iso)
  // ISO-uge: torsdagen i samme uge afgør året
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 4 - (((d.getUTCDay() + 6) % 7) + 1))
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Næste dato der udbetales (null hvis pauset, stoppet eller udløbet) */
export function nextAllowance(s: AllowanceLike, today: string, paidKeys: ReadonlySet<string> = new Set()): string | null {
  if (s.paused_at || s.stopped_at) return null
  let d = [today, s.pay_from, s.start_on].sort().at(-1)!
  for (let i = 0; i < 400; i++, d = addDaysIso(d, 1)) {
    if (s.end_on && d > s.end_on) return null
    if (isDueOn(s, d) && !paidKeys.has(periodKey(s.frequency, d))) return d
  }
  return null
}

export const rewardStatusLabels: Record<RewardStatus, string> = {
  none: 'Ingen belønning',
  awaiting_completion: 'Afventer udførelse',
  awaiting_approval: 'Afventer godkendelse',
  paid: 'Udbetalt',
  rejected: 'Afvist',
}
