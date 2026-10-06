import { BookOpen, ChevronLeft, ChevronRight, Copy, History, Plus, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { formatShortDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { addDaysIso } from '@/lib/home'
import { WEEKDAYS, weekDays, weekLabel, weekStart } from '@/lib/recipes'
import { mealErrorMessage, useCopyWeek, useMealHistory, useRecipes, useWeek, useWeekIngredients, type MealEntry, type Recipe } from './api'
import { BudgetCard } from './BudgetCard'
import { EntrySheet, type EntryTarget } from './EntrySheet'
import { ShoppingSheet } from './ShoppingSheet'

export function WeekView() {
  const [params, setParams] = useSearchParams()
  const today = toIsoDate(new Date())
  const thisMonday = weekStart(today)
  const raw = params.get('uge')
  const monday = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStart(raw) : thisMonday
  const week = useWeek(monday)
  const recipes = useRecipes()
  const history = useMealHistory()
  const ingredients = useWeekIngredients(monday, week.data)
  const copy = useCopyWeek()
  const [target, setTarget] = useState<EntryTarget | null>(null)
  const [shopping, setShopping] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const setWeek = (m: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (m === thisMonday) n.delete('uge')
        else n.set('uge', m)
        return n
      },
      { replace: true },
    )

  const byId = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r])), [recipes.data])
  const recentIds = useMemo(() => [...new Set((history.data ?? []).map((e) => e.recipe_id).filter((x): x is string => Boolean(x)))].slice(0, 8), [history.data])
  const entries = week.data ?? []
  const lastMonday = addDaysIso(monday, -7)
  const lastWeekHas = (history.data ?? []).some((e) => e.plan_date >= lastMonday && e.plan_date < monday)
  const hasRecipes = entries.some((e) => e.recipe_id)

  return (
    <>
      <BudgetCard />

      <div className="mt-5 mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="Forrige uge" onClick={() => setWeek(addDaysIso(monday, -7))} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 text-center">
          <h2 className="text-[17px] font-bold tracking-tight">{weekLabel(monday)}</h2>
          {monday !== thisMonday && (
            <button type="button" onClick={() => setWeek(thisMonday)} className="text-[13px] font-semibold text-accent-text">
              Til denne uge
            </button>
          )}
        </div>
        <button type="button" aria-label="Næste uge" onClick={() => setWeek(addDaysIso(monday, 7))} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
          <ChevronRight className="size-5" strokeWidth={2.5} />
        </button>
      </div>

      {week.isPending ? (
        <Skeleton className="h-[420px] rounded-card" />
      ) : week.isError ? (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">Madplanen kunne ikke hentes. Prøv igen.</p>
      ) : (
        <>
          {entries.length === 0 && lastWeekHas && (
            <Card variant="tonal" className="mb-3 flex items-center gap-3 p-4">
              <p className="min-w-0 flex-1 text-[14px] text-secondary">Ugen er tom. Vil I spise det samme som ugen før?</p>
              <Button size="sm" variant="surface" loading={copy.isPending} onClick={() => copy.mutate({ from: lastMonday, to: monday })}>
                <Copy className="size-4" /> Kopiér
              </Button>
            </Card>
          )}
          {copy.isError && <p className="mb-3 text-[13px] text-danger">{mealErrorMessage(copy.error)}</p>}

          <ol aria-label="Ugeplan" className="space-y-2">
            {weekDays(monday).map((d, i) => {
              const dayEntries = entries.filter((e) => e.plan_date === d)
              const isToday = d === today
              return (
                <li key={d} className={cn('rounded-card bg-surface-primary p-3.5 shadow-card', isToday && 'ring-2 ring-accent')}>
                  <div className="flex items-baseline justify-between gap-2 px-0.5">
                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-secondary">
                      {WEEKDAYS[i]}
                      {isToday && <span className="text-accent-text"> · I dag</span>}
                    </h3>
                    <span className="text-[12px] text-muted">{formatShortDate(fromIsoDate(d))}</span>
                  </div>
                  <ul className="mt-1.5 space-y-1.5">
                    {dayEntries.map((e) => (
                      <li key={e.id}>
                        <DishButton entry={e} recipe={e.recipe_id ? byId.get(e.recipe_id) : undefined} onClick={() => setTarget({ entry: e, date: d })} />
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    aria-label={`Tilføj ret ${WEEKDAYS[i]!.toLowerCase()}`}
                    onClick={() => setTarget({ date: d })}
                    className={cn(
                      'pressable flex w-full items-center gap-2 rounded-xl px-2.5 font-semibold text-accent-text',
                      dayEntries.length === 0 ? 'mt-1.5 h-10 bg-surface-secondary text-[14px]' : 'mt-1 h-8 text-[13px]',
                    )}
                  >
                    <Plus className="size-4" strokeWidth={2.6} /> {dayEntries.length === 0 ? 'Tilføj aftensmad' : 'Tilføj en ret mere'}
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="mt-5 space-y-2.5">
            <Button block disabled={!hasRecipes} onClick={() => setShopping(true)}>
              <ShoppingCart className="size-5" /> Tilføj ugens ingredienser til indkøbslisten
            </Button>
            {!hasRecipes && entries.length > 0 && <p className="px-1 text-center text-[13px] text-secondary">Kun retter med opskrift har ingredienser.</p>}
            <Button block variant="secondary" onClick={() => setShowHistory(true)}>
              <History className="size-5" /> Tidligere uger
            </Button>
          </div>
        </>
      )}

      <EntrySheet target={target} monday={monday} recipes={recipes.data ?? []} recentIds={recentIds} onClose={() => setTarget(null)} />
      <ShoppingSheet open={shopping} monday={monday} ingredients={ingredients.data ?? []} loading={ingredients.isPending} onClose={() => setShopping(false)} />
      <BottomSheet open={showHistory} onClose={() => setShowHistory(false)} title="Tidligere uger">
        {showHistory && (
          <PastWeeks
            history={history.data ?? []}
            current={monday}
            onReuse={(from) => copy.mutate({ from, to: monday }, { onSuccess: () => setShowHistory(false) })}
            busy={copy.isPending}
          />
        )}
      </BottomSheet>
    </>
  )
}

function DishButton({ entry, recipe, onClick }: { entry: MealEntry; recipe?: Recipe; onClick: () => void }) {
  const name = recipe?.name ?? entry.title
  return (
    <button type="button" onClick={onClick} className="pressable flex w-full items-center gap-3 rounded-xl bg-notice-soft px-3 py-2.5 text-left">
      {entry.recipe_id && <BookOpen aria-label="Opskrift" className="size-4.5 shrink-0 text-notice" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug break-words">{name}</span>
        {entry.recipe_id && (
          <span className="block text-[13px] text-secondary">
            {entry.servings ?? recipe?.servings ?? '?'} pers.{recipe?.prep_minutes ? ` · ${recipe.prep_minutes} min.` : ''}
          </span>
        )}
      </span>
      <ChevronRight className="size-4.5 shrink-0 text-muted" />
    </button>
  )
}

/** Tidligere uger med retter – kan genbruges i den viste uge */
function PastWeeks({ history, current, onReuse, busy }: { history: MealEntry[]; current: string; onReuse: (monday: string) => void; busy: boolean }) {
  const weeks = new Map<string, string[]>()
  // Ældste først inden for ugen (historikken kommer nyeste først)
  for (const e of [...history].reverse()) {
    const m = weekStart(e.plan_date)
    if (m === current) continue
    weeks.set(m, [...(weeks.get(m) ?? []), e.title])
  }
  const list = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  if (list.length === 0) return <p className="rounded-2xl bg-surface-secondary p-4 text-[15px] text-secondary">Ingen tidligere uger endnu.</p>
  return (
    <>
      <p className="mb-3 text-[14px] text-secondary">"Genbrug" kopierer retterne til den uge, du kigger på. Dage, der allerede har en ret, bliver ikke overskrevet.</p>
      <ul className="max-h-[56dvh] space-y-2 overflow-y-auto">
        {list.map(([m, titles]) => (
          <li key={m} className="flex items-center gap-3 rounded-2xl bg-surface-primary p-3.5 shadow-card">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{weekLabel(m)}</span>
              <span className="line-clamp-2 text-[13px] text-secondary">{titles.join(' · ')}</span>
            </span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReuse(m)} aria-label={`Genbrug ${weekLabel(m)}`}>
              Genbrug
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
