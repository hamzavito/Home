import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router'
import { formatAmount } from '@/lib/money'
import { formatPercent } from '@/lib/percent'
import { cn } from '@/lib/cn'
import type { BudgetLine } from '@/features/finance/api'
import type { MonthPlan } from '@/features/fixed/api'

type Row = { label: string; ore: number; sign?: '+' | '−' | ''; strong?: boolean; sub?: string; to?: string }

function money(ore: number) {
  return `${formatAmount(Math.abs(ore), { decimals: 'always' })} kr.`
}

/**
 * Månedens plan som vandfald (Nordnet-agtig, tæt men læsbar):
 * Indkomst − faste udgifter = tilbage − faste budgetbeløb = til fordeling → procentbudgetter → ufordelt.
 */
export function PlanWaterfall({ plan, lines, q = '' }: { plan: MonthPlan; lines: BudgetLine[]; q?: string }) {
  const fixedAmount = lines.filter((l) => l.budget_mode === 'amount' && !l.archived)
  const percent = lines.filter((l) => l.budget_mode === 'percent' && !l.archived)
  const over = plan.percent_total_bp > 10000

  const rows: Row[] = [
    { label: 'Indkomst', ore: plan.income_ore, sign: '+', to: `/okonomi/faste${q}` },
    { label: 'Faste udgifter', ore: plan.fixed_expenses_ore, sign: '−', to: `/okonomi/faste${q}` },
    { label: 'Tilbage efter faste udgifter', ore: plan.available_ore, strong: true },
    ...fixedAmount.map((l) => ({
      label: l.name,
      ore: l.default_ore,
      sign: '−' as const,
      sub: l.kind === 'reserve' ? 'Reserve' : 'Fast beløb',
      to: `/okonomi/budgetter/${l.category_id}${q}`,
    })),
    ...(fixedAmount.length > 0 ? [{ label: 'Til fordeling', ore: plan.distributable_ore, strong: true }] : []),
    ...percent.map((l) => ({
      label: l.name,
      ore: l.budget_ore,
      sign: '' as const,
      sub: `${formatPercent(l.percent_bp ?? 0)}${l.budget_source === 'override' ? ' · tilpasset' : ''}`,
      to: `/okonomi/budgetter/${l.category_id}${q}`,
    })),
  ]

  // Andel af indkomsten til stablet bar
  const inc = Math.max(plan.income_ore, 1)
  const seg = [
    { key: 'fixed', ore: Math.max(plan.fixed_expenses_ore, 0), color: 'var(--text-secondary)', label: 'Faste udgifter' },
    { key: 'amount', ore: Math.max(plan.fixed_allocations_ore, 0), color: 'var(--notice)', label: 'Faste budgetbeløb' },
    { key: 'percent', ore: Math.max(plan.allocated_ore - plan.fixed_allocations_ore, 0), color: 'var(--accent)', label: 'Fordelt' },
    { key: 'free', ore: Math.max(plan.unallocated_ore, 0), color: 'var(--positive)', label: 'Ufordelt' },
  ]

  return (
    <div>
      {plan.income_ore > 0 && (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-track" role="img" aria-label="Fordeling af indkomsten">
            {seg.map((s) => (
              <div key={s.key} className="animate-grow h-full" style={{ width: `${Math.min(100, (s.ore / inc) * 100)}%`, background: s.color }} />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-secondary">
            {seg
              .filter((s) => s.ore > 0)
              .map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
          </ul>
        </>
      )}

      <dl className="mt-4 divide-y divide-subtle">
        {rows.map((r, i) => {
          const content = (
            <>
              <dt className="min-w-0">
                <span className={cn('block truncate text-[15px]', r.strong ? 'font-bold' : 'font-medium')}>{r.label}</span>
                {r.sub && <span className="block text-[12px] text-secondary">{r.sub}</span>}
              </dt>
              <dd className={cn('tabular shrink-0 text-right', r.strong ? 'text-[17px] font-bold' : 'text-[15px] font-semibold', r.strong && r.ore < 0 && 'text-danger')}>
                {r.sign === '−' ? '−' : r.sign === '+' ? '' : ''}
                {r.ore < 0 && r.sign !== '−' ? '−' : ''}
                {money(r.ore)}
              </dd>
            </>
          )
          const cls = cn('flex items-center justify-between gap-3 py-2.5', r.strong && 'py-3')
          return r.to ? (
            <Link key={i} to={r.to} className={cn(cls, 'transition-opacity active:opacity-60')}>
              {content}
            </Link>
          ) : (
            <div key={i} className={cls}>
              {content}
            </div>
          )
        })}
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-[15px] font-bold">{plan.unallocated_ore < 0 ? 'Overfordelt' : 'Ufordelt'}</dt>
          <dd className={cn('tabular text-[17px] font-bold', plan.unallocated_ore < 0 ? 'text-danger' : plan.unallocated_ore > 0 ? 'text-positive' : '')}>
            {plan.unallocated_ore < 0 ? '−' : ''}
            {money(plan.unallocated_ore)}
          </dd>
        </div>
      </dl>

      {(over || plan.available_ore < 0) && (
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-notice-soft px-3.5 py-3 text-[13px] font-medium text-notice">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {plan.available_ore < 0
            ? 'De faste udgifter er større end indkomsten. Procentbudgetterne er sat til 0.'
            : `Procentbudgetterne summer til ${formatPercent(plan.percent_total_bp)}. De er skaleret ned, så der ikke fordeles mere end der er.`}
        </p>
      )}
    </div>
  )
}
