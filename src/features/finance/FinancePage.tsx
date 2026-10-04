import { Plus, Wallet } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { sections } from '@/app/sections'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { ShareList } from '@/components/finance/ShareList'
import { StatCard } from '@/components/finance/StatCard'
import { TransactionRow } from '@/components/finance/TransactionRow'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { dayLabel, formatMonth, fromIsoDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { cumulativeByDay, daysInMonth, elapsedDays } from '@/lib/series'
import { useBudgetMonth, useCategories, useMonthTransactions, type Transaction } from './api'
import { paidByLabel } from './paidBy'
import { useMonthParam } from './useMonthParam'

const memberColors = ['#5a3cf0', '#0f6e66', '#a8336a', '#1d5fae']

export function FinancePage() {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const budget = useBudgetMonth(month)
  const txs = useMonthTransactions(month)
  const categories = useCategories()

  const loading = budget.isPending || txs.isPending
  const list = txs.data ?? []
  const lines = budget.data ?? []
  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]))

  const spent = list.reduce((s, t) => s + t.amount_ore, 0)
  const totalBudget = lines.reduce((s, l) => s + l.budget_ore, 0)
  const remaining = totalBudget - spent
  const days = daysInMonth(month)
  const elapsed = elapsedDays(month)
  const series = cumulativeByDay(month, list.map((t) => ({ date: t.occurred_on, ore: t.amount_ore })), elapsed)
  const avgPerDay = elapsed > 0 ? Math.round(spent / elapsed) : 0

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

  // Gruppér pr. dag
  const groups: Array<{ day: string; items: Transaction[]; total: number }> = []
  for (const t of list) {
    const g = groups.at(-1)
    if (g && g.day === t.occurred_on) {
      g.items.push(t)
      g.total += t.amount_ore
    } else groups.push({ day: t.occurred_on, items: [t], total: t.amount_ore })
  }

  return (
    <>
      <PageHeader
        title="Økonomi"
        action={
          <Button size="sm" onClick={() => navigate('/okonomi/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Udgift
          </Button>
        }
      />

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {[sections.budgets, sections.upcoming, sections.receipts].map((s) => (
          <Link key={s.path} to={s.path} className="pressable flex shrink-0 items-center gap-2 rounded-full bg-surface-primary py-2 pl-2 pr-4 shadow-card">
            <span className="flex size-7 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)` }}>
              <s.icon className="size-4" style={{ color: s.color }} strokeWidth={2.3} />
            </span>
            <span className="text-[14px] font-semibold">{s.title}</span>
          </Link>
        ))}
      </div>

      <MonthSwitcher month={month} onChange={setMonth} />

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Forbrugt" ore={spent} sub={`${list.length} ${list.length === 1 ? 'udgift' : 'udgifter'}`} />
            <StatCard
              label={remaining >= 0 ? 'Tilbage' : 'Over budget'}
              ore={Math.abs(remaining)}
              tone={remaining >= 0 ? 'positive' : 'danger'}
              sub={`af ${formatAmount(totalBudget, { decimals: 'never' })} kr.`}
            />
          </div>

          <Card className="mt-3 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-[15px] font-semibold">Forbrug gennem {formatMonth(fromIsoDate(month))}</p>
              {elapsed > 0 && <p className="tabular text-[13px] text-secondary">ø {formatAmount(avgPerDay, { decimals: 'never' })} kr./dag</p>}
            </div>
            <SpendingChart series={series} days={days} budgetOre={totalBudget} />
            <div className="mt-3 flex gap-4 text-[12px] text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-accent" /> Forbrug
              </span>
              {totalBudget > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-strong" /> Jævnt tempo mod budget
                </span>
              )}
            </div>
          </Card>

          {spent > 0 && (
            <>
              <SectionHeader title="Pr. kategori" to={sections.budgets.path} linkLabel="Budgetter" />
              <Card className="p-5">
                <ShareList items={byCategory} total={spent} />
              </Card>

              <SectionHeader title="Betalt af" />
              <Card className="p-5">
                <ShareList items={byPerson} total={spent} />
              </Card>
            </>
          )}

          <SectionHeader title="Udgifter" />
          {groups.length === 0 ? (
            <Card variant="tonal">
              <EmptyState compact icon={Wallet} title="Ingen udgifter" text={`Intet registreret i ${formatMonth(fromIsoDate(month))}.`}>
                <Button size="sm" onClick={() => navigate('/okonomi/ny')}>
                  Registrér udgift
                </Button>
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.day}>
                  <div className="mb-1.5 flex justify-between px-1 text-[13px] font-semibold text-secondary">
                    <span>{dayLabel(g.day)}</span>
                    <span className="tabular">−{formatAmount(g.total)} kr.</span>
                  </div>
                  <Card padded={false} className="divide-y divide-subtle">
                    {g.items.map((t) => {
                      const c = catById.get(t.category_id)
                      return (
                        <TransactionRow
                          key={t.id}
                          title={t.description}
                          subtitle={`${c?.name ?? 'Kategori'} · ${paidByLabel(t.paid_by_kind, t.paid_by_user_id, members)}`}
                          amountOre={t.amount_ore}
                          icon={c?.icon ?? null}
                          color={c?.color ?? null}
                          to={`/okonomi/udgift/${t.id}`}
                        />
                      )
                    })}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
