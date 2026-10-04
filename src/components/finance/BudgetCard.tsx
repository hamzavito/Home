import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { budgetStatus, percentUsed, statusColor, statusLabel, statusSoft } from '@/lib/budget'
import { formatAmount } from '@/lib/money'
import { CategoryIcon } from './CategoryIcon'

export type BudgetCardData = {
  name: string
  icon: string | null
  color: string | null
  budgetOre: number
  spentOre: number
}

/** Kompakt budgetkort til dashboardets gitter. */
export function BudgetCard({ data, to }: { data: BudgetCardData; to?: string }) {
  const status = budgetStatus(data.spentOre, data.budgetOre)
  const pct = percentUsed(data.spentOre, data.budgetOre)
  return (
    <Card to={to} className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <CategoryIcon icon={data.icon} color={data.color} size="sm" />
        <span
          className="tabular rounded-full px-2 py-0.5 text-[12px] font-semibold"
          style={{ color: status === 'normal' ? 'var(--text-secondary)' : statusColor[status], background: statusSoft[status] }}
        >
          {pct} %
        </span>
      </div>
      <p className="mt-3 truncate text-[14px] font-medium text-text-secondary">{data.name}</p>
      <Money ore={data.spentOre} size="lg" decimals="never" className="mt-0.5" />
      <p className="tabular text-[13px] text-text-tertiary">af {formatAmount(data.budgetOre, { decimals: 'never' })} kr.</p>
      <ProgressBar value={data.spentOre} max={data.budgetOre} size="sm" className="mt-3" label={`${data.name}: ${statusLabel[status]}`} />
    </Card>
  )
}

/** Bred række til budgetsiden: navn, brugt/budget, tilbage og bar. */
export function BudgetRow({ data, pace, to }: { data: BudgetCardData; pace?: number; to?: string }) {
  const status = budgetStatus(data.spentOre, data.budgetOre)
  const remaining = data.budgetOre - data.spentOre
  return (
    <Card to={to} className="p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={data.icon} color={data.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{data.name}</p>
          <p className="tabular text-[13px] text-text-secondary">
            {formatAmount(data.spentOre, { decimals: 'never' })} / {formatAmount(data.budgetOre, { decimals: 'never' })} kr.
          </p>
        </div>
        <div className="text-right">
          <Money ore={Math.abs(remaining)} size="md" decimals="never" className={remaining < 0 ? 'text-danger' : undefined} />
          <p className="text-[12px]" style={{ color: status === 'normal' || status === 'none' ? 'var(--text-tertiary)' : statusColor[status] }}>
            {remaining < 0 ? 'over' : 'tilbage'}
          </p>
        </div>
      </div>
      <ProgressBar value={data.spentOre} max={data.budgetOre} pace={pace} className="mt-3.5" label={`${data.name}: ${statusLabel[status]}`} />
    </Card>
  )
}
