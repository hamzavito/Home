import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear, fromIsoDate, monthKey } from '@/lib/dates'

/** Kompakt månedsvælger med nedre grænse (fx "gælder fra"). */
export function MonthStepper({ month, onChange, min }: { month: string; onChange: (m: string) => void; min?: string }) {
  const d = fromIsoDate(month)
  const shift = (n: number) => onChange(monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)))
  const atMin = min !== undefined && month <= min
  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface-1 p-1 shadow-card">
      <button type="button" aria-label="Tidligere måned" disabled={atMin} onClick={() => shift(-1)} className="pressable flex size-11 items-center justify-center rounded-xl disabled:opacity-30">
        <ChevronLeft className="size-5" strokeWidth={2.5} />
      </button>
      <span className="text-[16px] font-semibold first-letter:uppercase">{formatMonthYear(d)}</span>
      <button type="button" aria-label="Senere måned" onClick={() => shift(1)} className="pressable flex size-11 items-center justify-center rounded-xl">
        <ChevronRight className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
