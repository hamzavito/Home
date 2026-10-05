import { CalendarClock, Camera, CheckSquare, ChevronRight, PiggyBank, Plus, Receipt, WalletCards } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { sections } from '@/app/sections'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { BudgetCard } from '@/components/finance/BudgetCard'
import { MoneyCard } from '@/components/finance/MoneyCard'
import { TransactionRow } from '@/components/finance/TransactionRow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useBudgetMonth, useCategories, useMonthTransactions, useRecentTransactions } from '@/features/finance/api'
import { useMonthPlan } from '@/features/fixed/api'
import { SavingsCard } from '@/components/finance/SavingsCard'
import { useGoals } from '@/features/savings/api'
import { goalSub } from '@/features/savings/SavingsPage'
import { useUpcoming } from '@/features/upcoming/api'
import { daysUntil, UpcomingRow } from '@/features/upcoming/UpcomingPage'
import { formatAmount } from '@/lib/money'
import { paidByLabel } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { dayLabel, formatMonth, greeting, monthKey, relativeDay, toIsoDate } from '@/lib/dates'
import { EventRow } from '@/features/calendar/EventRow'
import { useEvents, useTasks } from '@/features/home/api'
import { TaskRow } from '@/features/home/TaskRow'
import { addDaysIso, compareEvents } from '@/lib/home'
import { cumulativeByDay, daysInMonth, elapsedDays } from '@/lib/series'

export function DashboardPage() {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const now = new Date()
  const month = monthKey(now)
  const budget = useBudgetMonth(month)
  const monthTx = useMonthTransactions(month)
  const recent = useRecentTransactions(5)
  const categories = useCategories()
  const planQuery = useMonthPlan(month)
  const upcoming = useUpcoming()
  const goals = useGoals()
  const todayIso = toIsoDate(now)
  const events = useEvents(todayIso, addDaysIso(todayIso, 7))
  const tasks = useTasks()

  const days = daysInMonth(month)
  const elapsed = elapsedDays(month)
  // Hovedtallet gælder de variable forbrugsbudgetter. Reserver (fx Buffer) står for sig.
  const lines = (budget.data ?? []).filter((l) => l.kind === 'spending')
  const totalBudget = lines.reduce((s, l) => s + l.budget_ore, 0)
  const spent = lines.reduce((s, l) => s + l.spent_ore, 0)
  const spendingIds = new Set(lines.map((l) => l.category_id))
  const series = cumulativeByDay(
    month,
    (monthTx.data ?? []).filter((t) => spendingIds.has(t.category_id)).map((t) => ({ date: t.occurred_on, ore: t.amount_ore })),
    elapsed,
  )
  const plan = planQuery.data
  const hasPlan = Boolean(plan && (plan.income_ore !== 0 || plan.fixed_expenses_ore !== 0))
  const topBudgets = lines
    .filter((l) => !l.archived && (l.budget_ore > 0 || l.spent_ore > 0))
    .sort((a, b) => b.budget_ore - a.budget_ore || b.spent_ore - a.spent_ore)
    .slice(0, 4)
  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const nextUpcoming = (upcoming.data ?? []).filter((u) => u.status === 'upcoming' && daysUntil(u.due_on) <= 30).slice(0, 3)
  const activeGoals = (goals.data ?? []).filter((g) => !g.archived_at).sort((a, b) => b.currentOre / b.target_ore - a.currentOre / a.target_ore)
  const weekEvents = [...(events.data ?? [])].sort(compareEvents).slice(0, 3)
  // Opgaver der er forfaldne eller skal gøres i dag
  const dueTasks = (tasks.data?.active ?? []).filter((t) => t.due_on !== null && t.due_on <= todayIso).slice(0, 3)
  const names = members.map((m) => m.displayName).join(' & ')
  const hasCategories = (categories.data ?? []).some((c) => !c.archived_at)

  return (
    <>
      <header className="pb-4 pt-4">
        <p className="text-[15px] font-medium text-secondary">{greeting(now)}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em]">{names}</h1>
      </header>

      {budget.isPending ? (
        <Skeleton className="h-[300px] w-full rounded-card-lg" />
      ) : (
        <MoneyCard eyebrow={formatMonth(now)} budgetOre={totalBudget} spentOre={spent} pace={elapsed / days} to="/okonomi">
          {totalBudget > 0 || spent > 0 ? (
            <div className="mt-5">
              <SpendingChart series={series} days={days} budgetOre={totalBudget} tone="hero" height={64} />
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-hero-text-secondary">Opret budgetter for at se, hvor meget I har tilbage.</p>
          )}
        </MoneyCard>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="surface" onClick={() => navigate('/okonomi/ny')}>
          <Plus className="size-4.5" strokeWidth={2.5} /> Ny udgift
        </Button>
        <Button variant="surface" onClick={() => navigate('/kvitteringer/scan')}>
          <Camera className="size-4.5" /> Kvittering
        </Button>
      </div>

      {hasPlan && plan && (
        <Link to="/okonomi" className="pressable mt-3 block rounded-card bg-surface-primary p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-secondary">Månedens plan</p>
            <ChevronRight className="size-4 text-muted" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[12px] text-secondary">Indkomst</p>
              <p className="tabular text-[15px] font-semibold">{formatAmount(plan.income_ore, { decimals: 'never' })} kr.</p>
            </div>
            <div>
              <p className="text-[12px] text-secondary">Faste udgifter</p>
              <p className="tabular text-[15px] font-semibold">{formatAmount(plan.fixed_expenses_ore, { decimals: 'never' })} kr.</p>
            </div>
            <div>
              <p className="text-[12px] text-secondary">Tilbage</p>
              <p className={`tabular text-[15px] font-bold ${plan.available_ore < 0 ? 'text-danger' : 'text-positive'}`}>
                {plan.available_ore < 0 ? '−' : ''}
                {formatAmount(Math.abs(plan.available_ore), { decimals: 'never' })} kr.
              </p>
            </div>
          </div>
          {plan.unallocated_ore !== 0 && (
            <p className={`mt-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${plan.unallocated_ore < 0 ? 'bg-danger-soft text-danger' : 'bg-notice-soft text-notice'}`}>
              {plan.unallocated_ore < 0 ? 'Overfordelt' : 'Ufordelt'}: {formatAmount(Math.abs(plan.unallocated_ore), { decimals: 'always' })} kr.
            </p>
          )}
        </Link>
      )}

      <SectionHeader title="Budgetter" to={sections.budgets.path} />
      {budget.isPending ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      ) : topBudgets.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={WalletCards} title={hasCategories ? 'Ingen budgetter sat' : 'Ingen budgetter endnu'} text="Sæt et månedligt beløb pr. kategori.">
            <Button size="sm" onClick={() => navigate(sections.budgets.path)}>
              Kom i gang
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {topBudgets.map((l) => (
            <BudgetCard
              key={l.category_id}
              data={{ name: l.name, icon: l.icon, color: l.color, budgetOre: l.budget_ore, spentOre: l.spent_ore }}
              to={`/okonomi/budgetter/${l.category_id}`}
            />
          ))}
        </div>
      )}

      <SectionHeader title="Kommende" to="/okonomi/kommende" />
      {nextUpcoming.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CalendarClock} title="Intet de næste 30 dage" text="Planlæg fx tandlæge eller bilservice, så I kan se det komme.">
            <Button size="sm" variant="surface" onClick={() => navigate('/okonomi/kommende/ny')}>
              Tilføj kommende udgift
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {nextUpcoming.map((u) => (
            <UpcomingRow key={u.id} u={u} categoryName={catById.get(u.category_id)?.name} />
          ))}
        </Card>
      )}

      <SectionHeader title="Opsparing" to="/opsparing" />
      {activeGoals.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={PiggyBank} title="Ingen opsparingsmål" text="Sæt et mål, fx ferie eller nødbuffer.">
            <Button size="sm" variant="surface" onClick={() => navigate('/opsparing/ny')}>
              Opret mål
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {activeGoals.slice(0, 2).map((g) => (
            <SavingsCard key={g.id} name={g.name} currentOre={g.currentOre} targetOre={g.target_ore} sub={goalSub(g)} to={`/opsparing/${g.id}`} />
          ))}
        </div>
      )}

      <SectionHeader title="Hjemmet" to="/hjemmet" />
      {events.isPending || tasks.isPending ? (
        <Skeleton className="h-32 rounded-card" />
      ) : weekEvents.length === 0 && dueTasks.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CheckSquare} title="Roligt i hjemmet" text="Ingen aftaler de næste 7 dage og ingen opgaver i dag." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {weekEvents.map((e) => (
            <EventRow key={e.id} e={e} showDate={e.end_date ? undefined : dayLabel(e.event_date)} />
          ))}
          {dueTasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}

      <SectionHeader title="Seneste aktivitet" to="/okonomi" />
      {recent.isPending ? (
        <Skeleton className="h-48 rounded-card" />
      ) : (recent.data ?? []).length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Receipt} title="Ingen udgifter endnu" text="Registrerede udgifter vises her." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {recent.data!.map((t) => {
            const c = catById.get(t.category_id)
            return (
              <TransactionRow
                key={t.id}
                title={t.description}
                subtitle={`${c?.name ?? ''} · ${paidByLabel(t.paid_by_kind, t.paid_by_user_id, members)}`}
                amountOre={t.amount_ore}
                icon={c?.icon ?? null}
                color={c?.color ?? null}
                meta={relativeDay(t.occurred_on)}
                to={`/okonomi/udgift/${t.id}`}
              />
            )
          })}
        </Card>
      )}
    </>
  )
}
