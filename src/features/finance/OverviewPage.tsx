import { CalendarClock, Landmark, Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { sections } from '@/app/sections'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { PlanWaterfall } from '@/components/finance/PlanWaterfall'
import { ShareList } from '@/components/finance/ShareList'
import { StatCard } from '@/components/finance/StatCard'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useMonthPlan } from '@/features/fixed/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatMonth, fromIsoDate, monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { cumulativeByDay, daysInMonth, elapsedDays } from '@/lib/series'
import { BankInboxLink } from '@/features/bank/BankInboxLink'
import { useBudgetMonth, useMonthTransactions } from './api'
import { useMonthParam } from './useMonthParam'

export const memberColors = ['#5a3cf0', '#0f6e66', '#a8336a', '#1d5fae']

export function OverviewPage() {
  const { adults: members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const budget = useBudgetMonth(month)
  const txs = useMonthTransactions(month)
  const plan = useMonthPlan(month)
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`

  const loading = budget.isPending || txs.isPending || plan.isPending
  const list = txs.data ?? []
  const lines = budget.data ?? []
  // Variable budgetter = forbrugskategorier (reserver vises i vandfaldet)
  const spending = lines.filter((l) => l.kind === 'spending')
  const spent = spending.reduce((s, l) => s + l.spent_ore, 0)
  const totalBudget = spending.reduce((s, l) => s + l.budget_ore, 0)
  const remaining = totalBudget - spent
  const days = daysInMonth(month)
  const elapsed = elapsedDays(month)
  const spendingIds = new Set(spending.map((l) => l.category_id))
  const series = cumulativeByDay(
    month,
    list.filter((t) => spendingIds.has(t.category_id)).map((t) => ({ date: t.occurred_on, ore: t.amount_ore })),
    elapsed,
  )
  const allSpent = list.reduce((s, t) => s + t.amount_ore, 0)
  const avgPerDay = elapsed > 0 ? Math.round(spent / elapsed) : 0
  const hasPlan = (plan.data?.income_ore ?? 0) !== 0 || (plan.data?.fixed_expenses_ore ?? 0) !== 0

  const byCategory = lines
    .filter((l) => l.spent_ore > 0)
    .sort((a, b) => b.spent_ore - a.spent_ore)
    .map((l) => ({ key: l.category_id, label: l.name, ore: l.spent_ore, color: l.color }))

  const byPerson = [
    ...members.map((m, i) => ({
      key: m.userId,
      label: m.displayName,
      ore: list.filter((t) => t.paid_by_kind === 'member' && t.paid_by_user_id === m.userId).reduce((s, t) => s + t.amount_ore, 0),
      color: m.color ?? memberColors[i % memberColors.length]!,
      leading: <Avatar name={m.displayName} color={m.color} index={i} className="size-7 text-[11px]" />,
    })),
    {
      key: 'shared',
      label: 'Fælles',
      ore: list.filter((t) => t.paid_by_kind === 'shared').reduce((s, t) => s + t.amount_ore, 0),
      color: 'var(--text-muted)',
      leading: <Avatar name="Fælles" shared className="size-7" />,
    },
  ]

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <BankInboxLink />

      {loading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-72 rounded-card" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        </div>
      ) : (
        <>
          <SectionHeader title="Månedens plan" to={`/okonomi/faste${q}`} linkLabel="Faste poster" />
          {hasPlan && plan.data ? (
            <Card className="p-5">
              <PlanWaterfall plan={plan.data} lines={lines} q={q} />
            </Card>
          ) : (
            <Card variant="tonal">
              <EmptyState compact icon={Landmark} title="Ingen fast økonomi endnu" text="Tilføj jeres faste indtægter og udgifter, så beregner appen rådighedsbeløbet.">
                <Link to="/okonomi/faste">
                  <Button size="sm">Tilføj faste poster</Button>
                </Link>
              </EmptyState>
            </Card>
          )}

          <SectionHeader title="Variable budgetter" to={`/okonomi/budgetter${q}`} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Brugt" ore={spent} sub={`af ${formatAmount(totalBudget, { decimals: 'never' })} kr.`} />
            <StatCard label={remaining >= 0 ? 'Tilbage' : 'Over budget'} ore={Math.abs(remaining)} tone={remaining >= 0 ? 'positive' : 'danger'} sub={elapsed > 0 ? `ø ${formatAmount(avgPerDay, { decimals: 'never' })} kr./dag` : undefined} />
          </div>

          <Card className="mt-3 p-5">
            <p className="mb-4 text-[15px] font-semibold">Forbrug gennem {formatMonth(fromIsoDate(month))}</p>
            <SpendingChart series={series} days={days} budgetOre={totalBudget} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-accent" /> Faktisk forbrug
              </span>
              {totalBudget > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-strong" /> Jævnt tempo mod budget
                </span>
              )}
            </div>
          </Card>

          {allSpent > 0 && (
            <>
              <SectionHeader title="Pr. kategori" to={`/okonomi/budgetter${q}`} linkLabel="Budgetter" />
              <Card className="p-5">
                <ShareList items={byCategory} total={allSpent} />
              </Card>
              <SectionHeader title="Betalt af" to={`/okonomi/transaktioner${q}`} linkLabel="Transaktioner" />
              <Card className="p-5">
                <ShareList items={byPerson} total={allSpent} />
              </Card>
            </>
          )}

          <div className="mt-8 grid grid-cols-2 gap-3">
            {[sections.upcoming, sections.receipts].map((s) => (
              <Link key={s.path} to={s.path} className="pressable flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
                <span className="flex size-10 items-center justify-center rounded-[13px]" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)` }}>
                  {s.path === sections.upcoming.path ? <CalendarClock className="size-5" style={{ color: s.color }} /> : <Receipt className="size-5" style={{ color: s.color }} />}
                </span>
                <span className="text-[15px] font-semibold">{s.title}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
