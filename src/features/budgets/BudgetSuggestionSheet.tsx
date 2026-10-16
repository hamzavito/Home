import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { errorMessage, useBudgetMonth, useCreateCategory, useSetCategoryDefault } from '@/features/finance/api'
import { useMonthPlan } from '@/features/fixed/api'
import { useFamilyComposition } from '@/features/settings/family'
import { suggestBudget, type SuggestionCategory } from '@/lib/budgetSuggestion'
import { monthKey } from '@/lib/dates'
import { describeFamily } from '@/lib/family'
import { formatAmount } from '@/lib/money'
import { formatPercent } from '@/lib/percent'

/** Knap + ark: forslag til budgetfordeling ud fra familieoplysningerne */
export function BudgetSuggestionButton({ month, label = 'Forslag til budget', variant = 'surface' }: { month: string; label?: string; variant?: 'surface' | 'primary' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} block className="mt-4" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" /> {label}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Forslag til budget">
        {open && <SuggestionBody month={month} onDone={() => setOpen(false)} />}
      </BottomSheet>
    </>
  )
}

function SuggestionBody({ month, onDone }: { month: string; onDone: () => void }) {
  const family = useFamilyComposition()
  const budget = useBudgetMonth(month)
  const plan = useMonthPlan(month)
  const setDefault = useSetCategoryDefault()
  const create = useCreateCategory()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!family || budget.isPending || plan.isPending) return <p className="text-[15px] text-secondary">Henter …</p>

  const cats: SuggestionCategory[] = (budget.data ?? []).map((l) => ({ id: l.category_id, name: l.name, mode: l.budget_mode as SuggestionCategory['mode'], percentBp: l.percent_bp, archived: l.archived }))
  const s = suggestBudget(family, cats)
  const distributable = plan.data?.distributable_ore ?? 0
  const from = monthKey(new Date())

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      // Først dem, der falder (så de 100 % aldrig overskrides undervejs), derefter de nye
      const existing = s.items.filter((i) => i.categoryId).sort((a, b) => a.percentBp - a.currentBp - (b.percentBp - b.currentBp))
      for (const i of existing) await setDefault.mutateAsync({ categoryId: i.categoryId!, validFrom: from, mode: 'percent', amountOre: null, percentBp: i.percentBp })
      for (const i of s.items.filter((x) => !x.categoryId))
        await create.mutateAsync({ name: i.name, icon: i.icon, color: i.color, kind: 'spending', mode: 'percent', defaultOre: null, percentBp: i.percentBp })
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-[15px] text-secondary">
        Ud fra <span className="font-semibold text-primary">{describeFamily(family)}</span>. Børn tæller med, også uden login i appen.{' '}
        <Link to="/indstillinger/familie" className="font-semibold text-accent-text">
          Ret familieoplysninger
        </Link>
      </p>

      {s.items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-notice-soft px-4 py-3 text-[14px] font-medium text-notice">Der er ikke mere at fordele i procent – de andre kategorier bruger allerede de 100 %.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-subtle rounded-2xl bg-surface-secondary px-4" aria-label="Foreslået fordeling">
            {s.items.map((i) => (
              <li key={i.name} className="flex items-center gap-3 py-2.5">
                <CategoryIcon icon={i.icon} color={i.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{i.name}</span>
                  <span className="block text-[12.5px] text-secondary">{i.categoryId ? (i.currentBp ? `Nu ${formatPercent(i.currentBp)}` : 'Findes allerede') : 'Oprettes'}</span>
                </span>
                <span className="tabular shrink-0 text-right">
                  <span className="block text-[15px] font-semibold">{formatPercent(i.percentBp)}</span>
                  {distributable > 0 && <span className="block text-[12.5px] text-secondary">ca. {formatAmount(Math.round((distributable * i.percentBp) / 10000), { decimals: 'never' })} kr.</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-secondary">
            Procent af det, der er til fordeling efter faste udgifter og beløb. Det er et udgangspunkt – ret frit bagefter. Gælder fra denne måned og frem; tidligere måneder ændrer sig ikke
            {distributable <= 0 ? '. Tilføj indtægter og faste udgifter for at se beløb.' : '.'}
          </p>
        </>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Annullér
        </Button>
        <Button onClick={() => void apply()} loading={busy} disabled={s.items.length === 0}>
          Brug forslag
        </Button>
      </div>
    </>
  )
}
