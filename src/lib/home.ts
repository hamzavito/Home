// Hjælpere til opgaver og kalender (rene funktioner – testet i home.test.ts)
import { fromIsoDate, toIsoDate } from './dates'
import type { Recurrence } from '@/types/database'

/** "Hver uge", "Hver 2. uge", "Hver måned" … */
export function recurrenceLabel(r: Recurrence, interval = 1): string {
  if (r === 'none') return 'Gentages ikke'
  const unit = { daily: ['dag', 'dag'], weekly: ['uge', 'uge'], monthly: ['måned', 'måned'] }[r]
  return interval <= 1 ? `Hver ${unit[0]}` : `Hver ${interval}. ${unit[1]}`
}

/** Spejler private.next_due i databasen (kun til visning). */
export function nextDue(iso: string, r: Recurrence, interval = 1): string | null {
  const d = fromIsoDate(iso)
  if (r === 'daily') return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + interval, 12))
  if (r === 'weekly') return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * interval, 12))
  if (r === 'monthly') {
    // Som Postgres: 31. jan + 1 måned = 28./29. feb
    const target = new Date(d.getFullYear(), d.getMonth() + interval, 1, 12)
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
    return toIsoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last), 12))
  }
  return null
}

/** "09:30:00" → "09.30" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5).replace(':', '.')
}

/** "09:30:00" → "09:30" (værdi til <input type="time">) */
export function timeInputValue(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

type EventLike = { event_date: string; end_date: string | null; all_day: boolean; start_time: string | null; end_time: string | null }

/** Dækker aftalen den givne dag? (flerdagsaftaler dækker hele perioden) */
export function eventCovers(e: EventLike, iso: string): boolean {
  return e.event_date <= iso && (e.end_date ?? e.event_date) >= iso
}

/** "Hele dagen", "09.30–10.00" eller "18.00" */
export function eventTimeLabel(e: EventLike): string {
  if (e.all_day) return 'Hele dagen'
  const start = formatTime(e.start_time)
  return e.end_time ? `${start}–${formatTime(e.end_time)}` : start
}

/** Sortering inden for en dag: heldagsaftaler først, derefter efter starttid */
export function compareEvents(a: EventLike, b: EventLike): number {
  if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date)
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
  return (a.start_time ?? '').localeCompare(b.start_time ?? '')
}

/** Datoerne i en månedsvisning (mandag først), hele uger. */
export function monthGrid(month: string): string[] {
  const first = fromIsoDate(month.slice(0, 8) + '01')
  const offset = (first.getDay() + 6) % 7 // mandag = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset, 12)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12)))
}

export function addDaysIso(iso: string, n: number): string {
  const d = fromIsoDate(iso)
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12))
}

export function addMonthsIso(month: string, n: number): string {
  const d = fromIsoDate(month.slice(0, 8) + '01')
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + n, 1, 12))
}

export type TaskBucket = 'overdue' | 'today' | 'week' | 'later' | 'none'

/** Hvilken gruppe en åben opgave hører til */
export function taskBucket(due: string | null, today: string): TaskBucket {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  if (due <= addDaysIso(today, 7)) return 'week'
  return 'later'
}
