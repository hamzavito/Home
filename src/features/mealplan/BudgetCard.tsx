import { ChevronRight, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Money } from '@/components/ui/Money'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Spinner'
import { useBudgetMonth, useCategories } from '@/features/finance/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatMonth, fromIsoDate, monthKey } from '@/lib/dates'
import { useSetGroceryCategory } from './api'

/** Madbudgettet for indeværende måned – fra den budgetkategori husstanden har valgt til dagligvarer */
export function BudgetCard() {
  const navigate = useNavigate()
  const { groceryCategoryId } = useHousehold()
  const month = monthKey(new Date())
  const budget = useBudgetMonth(month)
  const [choose, setChoose] = useState(false)
  const line = budget.data?.find((l) => l.category_id === groceryCategoryId)

  if (budget.isPending) return <Skeleton className="h-[104px] rounded-card" />

  return (
    <>
      {!groceryCategoryId || !line ? (
        <button type="button" onClick={() => setChoose(true)} className="pressable flex w-full items-center gap-3 rounded-card bg-notice-soft p-4 text-left">
          <Wallet className="size-5 shrink-0 text-notice" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Vælg madbudget</span>
            <span className="block text-[13px] text-secondary">Hvilken budgetkategori bruger I til mad og dagligvarer?</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" />
        </button>
      ) : (
        <div className="rounded-card bg-notice-soft p-4">
          <button type="button" onClick={() => navigate(`/okonomi/budgetter/${line.category_id}`)} className="pressable block w-full text-left">
            <p className="text-[13px] font-semibold text-secondary">Madbudget tilbage i {formatMonth(fromIsoDate(month))}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              {line.budget_ore > 0 ? (
                <Money ore={line.budget_ore - line.spent_ore} size="xl" className={cn(line.budget_ore - line.spent_ore < 0 && 'text-danger')} />
              ) : (
                <p className="text-[17px] font-semibold">Intet budget sat</p>
              )}
              <span className="flex items-center gap-1 text-[13px] font-medium text-secondary">
                {line.name} <ChevronRight className="size-4" />
              </span>
            </div>
            {line.budget_ore > 0 && (
              <>
                <ProgressBar value={line.spent_ore} max={line.budget_ore} size="sm" className="mt-3" label={`Brugt af ${line.name}`} />
                <p className="mt-1.5 text-[13px] text-secondary">
                  Brugt <Money ore={line.spent_ore} size="sm" /> af <Money ore={line.budget_ore} size="sm" />
                </p>
              </>
            )}
          </button>
          <button type="button" onClick={() => setChoose(true)} className="mt-2 text-[13px] font-semibold text-accent-text">
            Skift madbudget
          </button>
        </div>
      )}
      <BottomSheet open={choose} onClose={() => setChoose(false)} title="Madbudget">
        {choose && <ChooseCategory onDone={() => setChoose(false)} />}
      </BottomSheet>
    </>
  )
}

function ChooseCategory({ onDone }: { onDone: () => void }) {
  const { groceryCategoryId } = useHousehold()
  const categories = useCategories()
  const set = useSetGroceryCategory()
  const options = (categories.data ?? []).filter((c) => !c.archived_at && c.kind === 'spending')
  return (
    <>
      <p className="mb-3 text-[15px] text-secondary">Madplanen viser, hvor meget der er tilbage af denne kategori i måneden.</p>
      {options.length === 0 ? (
        <p className="rounded-2xl bg-surface-secondary p-4 text-[14px] text-secondary">Opret først en budgetkategori under Økonomi → Budgetter.</p>
      ) : (
        <div role="radiogroup" aria-label="Budgetkategori til mad" className="flex flex-wrap gap-2">
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === groceryCategoryId}
              disabled={set.isPending}
              onClick={() => set.mutate(c.id, { onSuccess: onDone })}
              className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold', c.id === groceryCategoryId ? 'bg-accent text-on-accent' : 'bg-surface-primary shadow-card')}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {set.isError && <p className="mt-3 text-[13px] text-danger">Det kunne ikke gemmes. Prøv igen.</p>}
    </>
  )
}
