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
      <p className="mt-3 truncate text-[14px] font-medium text-secondary">{data.name}</p>
      <Money ore={data.spentOre} size="lg" decimals="never" className="mt-0.5" />
      <p className="tabular text-[13px] text-muted">af {formatAmount(data.budgetOre, { decimals: 'never' })} kr.</p>
      <ProgressBar value={data.spentOre} max={data.budgetOre} size="sm" className="mt-3" label={`${data.name}: ${statusLabel[status]}`} />
    </Card>
  )
}

/** Bred række til budgetsiden: navn, brugt/budget, tilbage og bar. */
export function BudgetRow({ data, pace, to, sub }: { data: BudgetCardData; pace?: number; to?: string; sub?: string }) {
  const status = budgetStatus(data.spentOre, data.budgetOre)
  const remaining = data.budgetOre - data.spentOre
  return (
    <Card to={to} className="p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={data.icon} color={data.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{data.name}</p>
          <p className="tabular text-[13px] text-secondary">
            {data.budgetOre === 0 && data.spentOre === 0
              ? 'Tryk for at sætte et budget'
              : `${formatAmount(data.spentOre, { decimals: 'never' })} / ${formatAmount(data.budgetOre, { decimals: 'never' })} kr.`}
          </p>
          {sub && <p className="truncate text-[12px] text-secondary">{sub}</p>}
        </div>
        {data.budgetOre === 0 && data.spentOre === 0 ? (
          <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[12px] font-semibold text-secondary">Intet budget</span>
        ) : (
          <div className="text-right">
            <Money ore={Math.abs(remaining)} size="md" decimals="never" className={remaining < 0 ? 'text-danger' : undefined} />
            <p className="text-[12px]" style={{ color: status === 'normal' || status === 'none' ? 'var(--text-muted)' : statusColor[status] }}>
              {remaining < 0 ? 'over' : 'tilbage'}
            </p>
          </div>
        )}
      </div>
      {data.budgetOre > 0 || data.spentOre > 0 ? (
        <ProgressBar value={data.spentOre} max={data.budgetOre} pace={data.budgetOre > 0 ? pace : undefined} className="mt-3.5" label={`${data.name}: ${statusLabel[status]}`} />
      ) : null}
    </Card>
  )
}
