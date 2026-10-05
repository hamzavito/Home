import { Plus, Sparkles, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router'
import { BudgetRow } from '@/components/finance/BudgetCard'
import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { errorMessage, useBudgetMonth, useCategories, useCreateSuggestedCategories, type BudgetLine } from '@/features/finance/api'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useMonthPlan } from '@/features/fixed/api'
import { suggestedCategories } from '@/lib/categories'
import { monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { formatPercent } from '@/lib/percent'
import { daysInMonth, elapsedDays } from '@/lib/series'

function ruleLabel(l: BudgetLine): string | undefined {
  if (l.budget_source === 'override') return 'Tilpasset denne måned'
  if (l.budget_mode === 'percent') return `${formatPercent(l.percent_bp ?? 0)} af til fordeling`
  if (l.budget_mode === 'amount') return 'Fast beløb'
  return undefined
}

export function BudgetsPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useMonthParam()
  const budget = useBudgetMonth(month)
  const plan = useMonthPlan(month)
  const categories = useCategories()
  const suggest = useCreateSuggestedCategories()

  const lines = budget.data ?? []
  const spending = lines.filter((l) => !l.archived && l.kind === 'spending')
  const reserves = lines.filter((l) => !l.archived && l.kind === 'reserve')
  const archived = lines.filter((l) => l.archived)
  const totalBudget = spending.reduce((s, l) => s + l.budget_ore, 0)
  const totalSpent = spending.reduce((s, l) => s + l.spent_ore, 0)
  const elapsed = elapsedDays(month)
  const days = daysInMonth(month)
  const pace = elapsed > 0 && elapsed < days ? elapsed / days : undefined
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`
  const archivedCategories = (categories.data ?? []).filter((c) => c.archived_at)
  const unallocated = plan.data?.unallocated_ore ?? 0
  const hasPlan = (plan.data?.income_ore ?? 0) !== 0

  const row = (l: BudgetLine) => (
    <BudgetRow
      key={l.category_id}
      data={{ name: l.name, icon: l.icon, color: l.color, budgetOre: l.budget_ore, spentOre: l.spent_ore }}
      sub={ruleLabel(l)}
      pace={pace}
      to={`/okonomi/budgetter/${l.category_id}${q}`}
    />
  )

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />

      {budget.isPending ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : budget.isError ? (
        <EmptyState icon={WalletCards} title="Kunne ikke hente budgetter" text={errorMessage(budget.error)} />
      ) : lines.length === 0 ? (
        <Card variant="tonal" className="mt-4">
          <EmptyState compact icon={WalletCards} title="Ingen budgetkategorier" text="Opret jeres egne kategorier, eller start med et sæt forslag.">
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => suggest.mutate(suggestedCategories)} loading={suggest.isPending}>
                <Sparkles className="size-4" /> Opret forslag
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/okonomi/budgetter/ny')}>
                Opret selv
              </Button>
              <p className="text-[12px] text-secondary">{suggestedCategories.map((c) => c.name).join(' · ')}</p>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="mt-4 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-secondary">Brugt af variable budgetter</p>
                <Money ore={totalSpent} size="xl" decimals="never" />
              </div>
              <p className="tabular pb-0.5 text-right text-[14px] text-secondary">af {formatAmount(totalBudget, { decimals: 'never' })} kr.</p>
            </div>
            <ProgressBar value={totalSpent} max={totalBudget} pace={pace} size="lg" className="mt-4" label="Samlet budget" />
            <p className="tabular mt-2.5 text-[13px] text-secondary">
              {totalBudget - totalSpent >= 0 ? (
                <>
                  <span className="font-semibold text-positive">{formatAmount(totalBudget - totalSpent, { decimals: 'never' })} kr.</span> tilbage
                </>
              ) : (
                <>
                  <span className="font-semibold text-danger">{formatAmount(totalSpent - totalBudget, { decimals: 'never' })} kr.</span> over budget
                </>
              )}
              {hasPlan && unallocated !== 0 && (
                <span className={unallocated < 0 ? 'text-danger' : ''}>
                  {' · '}
                  {unallocated < 0 ? 'Overfordelt' : 'Ufordelt'} {formatAmount(Math.abs(unallocated), { decimals: 'never' })} kr.
                </span>
              )}
            </p>
          </Card>

          <div className="mt-4 space-y-3">{spending.map(row)}</div>

          {reserves.length > 0 && (
            <>
              <SectionHeader title="Reserver" />
              <div className="space-y-3">{reserves.map(row)}</div>
            </>
          )}

          {archived.length > 0 && (
            <>
              <SectionHeader title="Arkiveret, men med forbrug" />
              <div className="space-y-3">{archived.map(row)}</div>
            </>
          )}

          <Button variant="surface" block className="mt-5" onClick={() => navigate('/okonomi/budgetter/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Ny kategori
          </Button>
        </>
      )}

      {archivedCategories.length > 0 && (
        <>
          <SectionHeader title="Arkiverede kategorier" />
          <ListGroup>
            {archivedCategories.map((c) => (
              <ListRow key={c.id} title={c.name} subtitle="Arkiveret · historik bevaret" to={`/okonomi/budgetter/${c.id}`} trailing={<CategoryIcon icon={c.icon} color={c.color} size="sm" />} />
            ))}
          </ListGroup>
        </>
      )}
    </>
  )
}
