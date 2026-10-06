import { BookOpen, Search, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Field, SelectInput, TextInput } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Stepper } from '@/components/ui/Stepper'
import { cn } from '@/lib/cn'
import { formatShortDate, fromIsoDate } from '@/lib/dates'
import { normalizeName, WEEKDAYS, weekDays } from '@/lib/recipes'
import { mealErrorMessage, useDeleteEntry, useSaveEntry, type MealEntry, type Recipe } from './api'

export type EntryTarget = { entry?: MealEntry; date: string; recipeId?: string }

const QUICK = ['Rester', 'Takeaway', 'Spiser ude']

/** Tilføj eller ret en ret: vælg opskrift eller skriv en simpel ret, flyt dag eller fjern */
export function EntrySheet({ target, monday, recipes, recentIds, onClose }: { target: EntryTarget | null; monday: string; recipes: Recipe[]; recentIds: string[]; onClose: () => void }) {
  return (
    <BottomSheet open={target !== null} onClose={onClose} title={target?.entry ? 'Ret' : 'Tilføj ret'}>
      {target && <EntryForm key={target.entry?.id ?? `${target.date}-${target.recipeId}`} target={target} monday={monday} recipes={recipes} recentIds={recentIds} onDone={onClose} />}
    </BottomSheet>
  )
}

function EntryForm({ target, monday, recipes, recentIds, onDone }: { target: EntryTarget; monday: string; recipes: Recipe[]; recentIds: string[]; onDone: () => void }) {
  const save = useSaveEntry()
  const del = useDeleteEntry()
  const existing = target.entry
  const initialRecipe = existing?.recipe_id ?? target.recipeId ?? null
  const [mode, setMode] = useState<'recipe' | 'free'>(existing && !existing.recipe_id ? 'free' : recipes.length === 0 && !initialRecipe ? 'free' : 'recipe')
  const [recipeId, setRecipeId] = useState<string | null>(initialRecipe)
  const [servings, setServings] = useState<number>(existing?.servings ?? recipes.find((r) => r.id === initialRecipe)?.servings ?? 4)
  const [title, setTitle] = useState(existing && !existing.recipe_id ? existing.title : '')
  const [date, setDate] = useState(existing?.plan_date ?? target.date)
  const [query, setQuery] = useState('')

  const recipe = recipes.find((r) => r.id === recipeId)
  // Favoritter først, så nyligt brugte, så resten (alfabetisk)
  const rank = (r: Recipe) => (r.is_favorite ? 0 : recentIds.includes(r.id) ? 1 : 2)
  const q = normalizeName(query)
  const shown = recipes
    .filter((r) => !q || normalizeName(r.name).includes(q) || (r.category && normalizeName(r.category).includes(q)))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'da'))
  const valid = mode === 'recipe' ? Boolean(recipe) : title.trim().length > 0

  async function onSave() {
    if (!valid) return
    try {
      await save.mutateAsync({
        id: existing?.id,
        input:
          mode === 'recipe' && recipe
            ? { planDate: date, recipeId: recipe.id, title: recipe.name, servings }
            : { planDate: date, recipeId: null, title: title.trim(), servings: null },
      })
      onDone()
    } catch {
      // vises nedenfor
    }
  }

  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Type af ret"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'recipe', label: 'Opskrift' },
          { value: 'free', label: 'Uden opskrift' },
        ]}
      />

      {mode === 'recipe' ? (
        recipes.length === 0 ? (
          <p className="rounded-2xl bg-surface-secondary p-4 text-[14px] text-secondary">I har ingen opskrifter endnu. Skriv en simpel ret, eller opret en opskrift under Opskrifter.</p>
        ) : (
          <>
            {recipes.length > 6 && (
              <label className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted" />
                <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg i opskrifter" aria-label="Søg i opskrifter" className="pl-11" />
              </label>
            )}
            <div role="radiogroup" aria-label="Opskrift" className="max-h-[34dvh] space-y-1.5 overflow-y-auto rounded-2xl">
              {shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={r.id === recipeId}
                  onClick={() => {
                    setRecipeId(r.id)
                    setServings(r.servings)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors',
                    r.id === recipeId ? 'bg-surface-accent ring-2 ring-accent' : 'bg-surface-primary shadow-card',
                  )}
                >
                  <BookOpen className="size-4.5 shrink-0 text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{r.name}</span>
                    {r.category && <span className="block text-[13px] text-secondary">{r.category}</span>}
                  </span>
                  {r.is_favorite && <Star aria-label="Favorit" className="size-4 shrink-0 fill-current text-notice" />}
                </button>
              ))}
              {shown.length === 0 && <p className="px-1 py-2 text-[14px] text-secondary">Ingen opskrifter matcher.</p>}
            </div>
            {recipe && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-secondary">Portioner</span>
                <Stepper label="Portioner" value={servings} onChange={setServings} unit="pers." />
              </div>
            )}
          </>
        )
      ) : (
        <Field label="Ret">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Pasta bolognese" maxLength={100} autoCapitalize="sentences" />
          <span className="mt-2 flex flex-wrap gap-2">
            {QUICK.map((t) => (
              <button key={t} type="button" onClick={() => setTitle(t)} className="pressable h-9 rounded-full bg-surface-secondary px-3.5 text-[13px] font-semibold">
                {t}
              </button>
            ))}
          </span>
        </Field>
      )}

      <Field label="Dag">
        <SelectInput value={date} onChange={(e) => setDate(e.target.value)}>
          {weekDays(monday).map((d, i) => (
            <option key={d} value={d}>
              {WEEKDAYS[i]} {formatShortDate(fromIsoDate(d))}
            </option>
          ))}
          {!weekDays(monday).includes(date) && <option value={date}>{formatShortDate(fromIsoDate(date))}</option>}
        </SelectInput>
      </Field>

      {(save.isError || del.isError) && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{mealErrorMessage(save.error ?? del.error)}</p>}
      <div className={cn('grid gap-3', existing ? 'grid-cols-[auto_1fr]' : 'grid-cols-1')}>
        {existing && (
          <Button variant="danger" aria-label="Fjern ret" loading={del.isPending} onClick={() => del.mutate(existing.id, { onSuccess: onDone })}>
            <Trash2 className="size-4.5" /> Fjern
          </Button>
        )}
        <Button disabled={!valid} loading={save.isPending} onClick={onSave}>
          {existing ? 'Gem' : 'Tilføj'}
        </Button>
      </div>
    </div>
  )
}
