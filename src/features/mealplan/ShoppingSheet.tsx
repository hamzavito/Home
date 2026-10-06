import { Check, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Spinner'
import { useShopping } from '@/features/home/api'
import { cn } from '@/lib/cn'
import { isPantryStaple, type MergedIngredient } from '@/lib/recipes'
import { mealErrorMessage, useAddToShopping } from './api'

type Status = 'new' | 'on-list' | 'bought'

/** Ugens ingredienser → indkøbslisten. Fravælg det, I allerede har. */
export function ShoppingSheet({ open, monday, ingredients, loading, onClose }: { open: boolean; monday: string; ingredients: MergedIngredient[]; loading: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Til indkøbslisten">
      {open && (loading ? <Skeleton className="h-48 rounded-2xl" /> : <Picker monday={monday} ingredients={ingredients} onClose={onClose} />)}
    </BottomSheet>
  )
}

function Picker({ monday, ingredients, onClose }: { monday: string; ingredients: MergedIngredient[]; onClose: () => void }) {
  const shopping = useShopping()
  const add = useAddToShopping()
  const [done, setDone] = useState<number | null>(null)

  // Hvad er allerede sendt fra denne uge? (samme nøgle som databasen bruger)
  const status = useMemo(() => {
    const map = new Map<string, Status>()
    for (const i of shopping.data?.items ?? []) {
      if (i.source_key?.startsWith(`meal:${monday}:`)) map.set(i.source_key.slice(`meal:${monday}:`.length), i.is_checked ? 'bought' : 'on-list')
    }
    return map
  }, [shopping.data, monday])

  // Standard: alt skal købes – undtagen basisvarer (salt, peber …) og det, der allerede er købt
  const [have, setHave] = useState<Set<string>>(() => new Set(ingredients.filter((i) => isPantryStaple(i.name)).map((i) => i.key)))
  const statusOf = (key: string): Status => status.get(key) ?? 'new'
  const selected = ingredients.filter((i) => !have.has(i.key) && statusOf(i.key) !== 'bought')

  if (done !== null)
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-positive-soft">
          <Check className="size-7 text-positive" strokeWidth={3} />
        </span>
        <p className="mt-3 text-[17px] font-semibold">{done === 1 ? '1 vare' : `${done} varer`} på indkøbslisten</p>
        <p className="mt-1 text-[14px] text-secondary">Varer, der allerede stod der, er opdateret – ingen dubletter.</p>
        <div className="mt-5 grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Luk
          </Button>
          <Link to="/indkob" className="pressable flex h-13 items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-on-accent">
            Se listen
          </Link>
        </div>
      </div>
    )

  if (ingredients.length === 0)
    return <p className="rounded-2xl bg-surface-secondary p-4 text-[15px] text-secondary">Ingen ingredienser denne uge. Kun retter med opskrift har ingredienser.</p>

  return (
    <>
      <p className="mb-3 text-[14px] text-secondary">Tryk på det, I allerede har derhjemme. Ens ingredienser er lagt sammen.</p>
      <ul aria-label="Ingredienser" className="max-h-[52dvh] divide-y divide-subtle overflow-y-auto rounded-2xl bg-surface-primary shadow-card">
        {ingredients.map((i) => {
          const st = statusOf(i.key)
          const buy = !have.has(i.key) && st !== 'bought'
          return (
            <li key={i.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={buy}
                disabled={st === 'bought'}
                onClick={() =>
                  setHave((s) => {
                    const n = new Set(s)
                    if (n.has(i.key)) n.delete(i.key)
                    else n.add(i.key)
                    return n
                  })
                }
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-60"
              >
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2', buy ? 'border-accent bg-accent text-on-accent' : 'border-strong')}>
                  {buy && <Check className="size-3.5" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[15px] font-semibold', !buy && 'text-secondary')}>
                    {i.name}
                    {i.quantity && <span className="font-normal text-secondary"> · {i.quantity}</span>}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{i.from.join(', ')}</span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-secondary">
                  {st === 'bought' ? 'Købt' : st === 'on-list' ? 'På listen' : !buy ? 'Har vi' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {add.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{mealErrorMessage(add.error)}</p>}
      <Button
        block
        className="mt-4"
        disabled={selected.length === 0}
        loading={add.isPending}
        onClick={() => add.mutate({ monday, items: selected }, { onSuccess: () => setDone(selected.length) })}
      >
        <ShoppingCart className="size-5" /> Tilføj {selected.length === 1 ? '1 vare' : `${selected.length} varer`}
      </Button>
    </>
  )
}
