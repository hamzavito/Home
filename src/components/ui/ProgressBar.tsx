import { budgetStatus, statusColor, type BudgetStatus } from '@/lib/budget'
import { cn } from '@/lib/cn'

type Props = {
  value: number
  max: number
  /** Farvelægning: budget (status-farver), positive (opsparing), accent eller hero (på mørkt kort) */
  tone?: 'budget' | 'positive' | 'accent' | 'hero'
  /** Vis en markør for hvor langt vi er i måneden (0–1) */
  pace?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-2.5' }

export function ProgressBar({ value, max, tone = 'budget', pace, size = 'md', className, label }: Props) {
  const ratio = max > 0 ? value / max : value > 0 ? 1 : 0
  const pct = Math.min(1, Math.max(0, ratio))
  const status: BudgetStatus = budgetStatus(value, max)
  const fill =
    tone === 'positive'
      ? 'var(--positive)'
      : tone === 'accent'
        ? 'var(--accent)'
        : tone === 'hero'
          ? status === 'over'
            ? 'var(--danger)'
            : status === 'warning'
              ? 'var(--warning)'
              : 'var(--hero-fill)'
          : status === 'normal'
            ? 'var(--accent)'
            : statusColor[status]

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn('relative w-full overflow-hidden rounded-full', heights[size], className)}
      style={{ background: tone === 'hero' ? 'var(--hero-track)' : 'var(--track)' }}
    >
      <div className="animate-grow h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: fill }} />
      {pace !== undefined && pace > 0 && pace < 1 && (
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 rounded-full"
          style={{ left: `calc(${pace * 100}% - 1px)`, background: tone === 'hero' ? 'rgb(255 255 255 / 0.55)' : 'var(--text-tertiary)' }}
        />
      )}
    </div>
  )
}
