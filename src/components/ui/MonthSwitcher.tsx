import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear, fromIsoDate, monthKey } from '@/lib/dates'

/** Vælg måned. `month` er "YYYY-MM-01". */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const d = fromIsoDate(month)
  const shift = (n: number) => onChange(monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)))
  const isCurrent = month === monthKey(new Date())
  const label = formatMonthYear(d)
  return (
    <div className="flex items-center justify-between rounded-full bg-surface-1 p-1 shadow-card">
      <button type="button" aria-label="Forrige måned" onClick={() => shift(-1)} className="pressable flex size-10 items-center justify-center rounded-full active:bg-surface-2">
        <ChevronLeft className="size-5" strokeWidth={2.5} />
      </button>
      <button type="button" onClick={() => onChange(monthKey(new Date()))} className="text-[15px] font-semibold first-letter:uppercase" aria-label={`${label}${isCurrent ? '' : ', tryk for at gå til denne måned'}`}>
        {label}
      </button>
      <button type="button" aria-label="Næste måned" onClick={() => shift(1)} className="pressable flex size-10 items-center justify-center rounded-full active:bg-surface-2">
        <ChevronRight className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
