import { cn } from '@/lib/cn'
import { fromIsoDate } from '@/lib/dates'

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.']

/** Lille kalenderblok: dag + måned. */
export function DateBadge({ iso, tone = 'default' }: { iso: string; tone?: 'default' | 'overdue' | 'muted' }) {
  const d = fromIsoDate(iso)
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none',
        tone === 'overdue' ? 'bg-notice-soft text-notice' : tone === 'muted' ? 'bg-surface-secondary text-secondary' : 'bg-surface-accent text-accent-text',
      )}
    >
      <span className="tabular text-[18px] font-bold">{d.getDate()}</span>
      <span className="mt-0.5 text-[11px] font-semibold">{MONTHS[d.getMonth()]}</span>
    </span>
  )
}
