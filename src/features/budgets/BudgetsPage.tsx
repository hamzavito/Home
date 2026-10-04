import { Plus, Sparkles, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router'
import { BudgetRow } from '@/components/finance/BudgetCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { errorMessage, useBudgetMonth, useCategories, useCreateSuggestedCategories } from '@/features/finance/api'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { suggestedCategories } from '@/lib/categories'
import { monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { daysInMonth, elapsedDays } from '@/lib/series'

export function BudgetsPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useMonthParam()
  const budget = useBudgetMonth(month)
  const categories = useCategories()
  const suggest = useCreateSuggestedCategories()

  const lines = budget.data ?? []
  const active = lines.filter((l) => !l.archived)
  const archived = lines.filter((l) => l.archived)
  const totalBudget = lines.reduce((s, l) => s + l.budget_ore, 0)
  const totalSpent = lines.reduce((s, l) => s + l.spent_ore, 0)
  const elapsed = elapsedDays(month)
  const days = daysInMonth(month)
  const pace = elapsed > 0 && elapsed < days ? elapsed / days : undefined
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`
  const archivedCategories = (categories.data ?? []).filter((c) => c.archived_at)

  return (
    <>
      <PageHeader
        title="Budgetter"
        back="/okonomi"
        action={
          <Button size="sm" onClick={() => navigate('/okonomi/budgetter/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Ny
          </Button>
        }
      />
      <MonthSwitcher month={month} onChange={setMonth} />

      {budget.isPending ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : budget.isError ? (
        <EmptyState icon={WalletCards} title="Kunne ikke hente budgetter" text={errorMessage(budget.error)} />
      ) : lines.length === 0 ? (
        <Card variant="tonal" className="mt-4">
          <EmptyState compact icon={WalletCards} title="Ingen budgetkategorier" text="Opret jeres egne kategorier, eller start med et sæt forslag.">
            <div className="flex flex-col gap-2">
              <Button onClick={() => suggest.mutate(suggestedCategories)} loading={suggest.isPending}>
                <Sparkles className="size-4" /> Opret forslag
              </Button>
              <p className="text-[12px] text-text-tertiary">{suggestedCategories.map((c) => c.name).join(' · ')}</p>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="mt-4 p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[13px] font-medium text-text-secondary">Brugt i alt</p>
                <Money ore={totalSpent} size="xl" decimals="never" />
              </div>
              <p className="tabular pb-0.5 text-right text-[14px] text-text-secondary">
                af {formatAmount(totalBudget, { decimals: 'never' })} kr.
              </p>
            </div>
            <ProgressBar value={totalSpent} max={totalBudget} pace={pace} size="lg" className="mt-4" label="Samlet budget" />
            <p className="tabular mt-2.5 text-[13px] text-text-secondary">
              {totalBudget - totalSpent >= 0 ? (
                <>
                  <span className="font-semibold text-positive">{formatAmount(totalBudget - totalSpent, { decimals: 'never' })} kr.</span> tilbage
                </>
              ) : (
                <>
                  <span className="font-semibold text-danger">{formatAmount(totalSpent - totalBudget, { decimals: 'never' })} kr.</span> over budget
                </>
              )}
            </p>
          </Card>

          <div className="mt-4 space-y-3">
            {active.map((l) => (
              <BudgetRow
                key={l.category_id}
                data={{ name: l.name, icon: l.icon, color: l.color, budgetOre: l.budget_ore, spentOre: l.spent_ore }}
                pace={pace}
                to={`/okonomi/budgetter/${l.category_id}${q}`}
              />
            ))}
          </div>

          {archived.length > 0 && (
            <>
              <SectionHeader title="Arkiveret, men med forbrug" />
              <div className="space-y-3 opacity-80">
                {archived.map((l) => (
                  <BudgetRow
                    key={l.category_id}
                    data={{ name: l.name, icon: l.icon, color: l.color, budgetOre: l.budget_ore, spentOre: l.spent_ore }}
                    to={`/okonomi/budgetter/${l.category_id}${q}`}
                  />
                ))}
              </div>
            </>
          )}
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
