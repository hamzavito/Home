import { fromIsoDate } from '@/lib/dates'
import { addDaysIso } from '@/lib/home'

/** Danish Monday-first seven-day ISO calendar week. */
export function weekDays(iso: string): string[] {
  const monday = addDaysIso(iso, -((fromIsoDate(iso).getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
}
