import { BookOpen, ChevronRight, Clock, Plus, Search, Star } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { normalizeName } from '@/lib/recipes'
import { useMealHistory, useRecipes, useSetFavorite, type Recipe } from './api'

/** Opskrifter (alle) eller kun favoritter */
export function RecipeList({ favoritesOnly }: { favoritesOnly: boolean }) {
  const navigate = useNavigate()
  const recipes = useRecipes()
  const history = useMealHistory()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const all = recipes.data ?? []
  const base = favoritesOnly ? all.filter((r) => r.is_favorite) : all
  const categories = [...new Set(base.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, 'da'))
  const q = normalizeName(query)
  const shown = base.filter(
    (r) =>
      (!category || r.category === category) &&
      (!q || normalizeName(r.name).includes(q) || r.tags.some((t) => normalizeName(t).includes(q)) || (r.category && normalizeName(r.category).includes(q))),
  )

  // Nyligt brugt: de seneste forskellige opskrifter fra madplanen
  const recent: Recipe[] = []
  const byId = new Map(all.map((r) => [r.id, r]))
  for (const e of history.data ?? []) {
    const r = e.recipe_id ? byId.get(e.recipe_id) : undefined
    if (r && !recent.includes(r)) recent.push(r)
    if (recent.length === 5) break
  }

  if (recipes.isPending) return <Skeleton className="h-64 rounded-card" />
  if (recipes.isError) return <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">Opskrifterne kunne ikke hentes. Prøv igen.</p>

  if (base.length === 0)
    return (
      <Card variant="tonal">
        <EmptyState
          compact
          icon={favoritesOnly ? Star : BookOpen}
          title={favoritesOnly ? 'Ingen favoritter endnu' : 'Ingen opskrifter endnu'}
          text={favoritesOnly ? 'Tryk på stjernen ved en opskrift for at gøre den til favorit.' : 'Gem jeres egne opskrifter med ingredienser, så de kan sendes til indkøbslisten.'}
        >
          {!favoritesOnly && (
            <Button size="sm" variant="surface" onClick={() => navigate('/hjemmet/madplan/opskrift/ny')}>
              <Plus className="size-4" /> Ny opskrift
            </Button>
          )}
        </EmptyState>
      </Card>
    )

  return (
    <>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted" />
        <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg på navn, kategori eller tag" aria-label="Søg i opskrifter" className="pl-11" />
      </label>
      {categories.length > 1 && (
        <div role="radiogroup" aria-label="Kategori" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? 'alle'}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn('pressable h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold', category === c ? 'bg-surface-inverse text-on-inverse' : 'bg-surface-primary shadow-card')}
            >
              {c ?? 'Alle'}
            </button>
          ))}
        </div>
      )}

      {!favoritesOnly && !q && !category && recent.length > 0 && (
        <>
          <SectionHeader title="Nyligt brugt" />
          <Card padded={false} className="divide-y divide-subtle">
            {recent.map((r) => (
              <RecipeRow key={r.id} recipe={r} />
            ))}
          </Card>
          <SectionHeader title="Alle opskrifter" />
        </>
      )}

      {shown.length === 0 ? (
        <p className="mt-4 px-1 text-[15px] text-secondary">Ingen opskrifter matcher.</p>
      ) : (
        <Card padded={false} className={cn('divide-y divide-subtle', (favoritesOnly || q || category || recent.length === 0) && 'mt-4')}>
          {shown.map((r) => (
            <RecipeRow key={r.id} recipe={r} />
          ))}
        </Card>
      )}
    </>
  )
}

function RecipeRow({ recipe }: { recipe: Recipe }) {
  const fav = useSetFavorite()
  const meta = [recipe.category, recipe.prep_minutes ? `${recipe.prep_minutes} min.` : null, `${recipe.servings} pers.`].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-1 pr-2">
      <Link to={`/hjemmet/madplan/opskrift/${recipe.id}`} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 active:bg-surface-secondary">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-notice-soft">
          <BookOpen className="size-5 text-notice" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug break-words">{recipe.name}</span>
          <span className="flex items-center gap-1 text-[13px] text-secondary">
            {recipe.prep_minutes ? <Clock className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{meta}</span>
          </span>
          {recipe.tags.length > 0 && <span className="block truncate text-[12px] text-muted">{recipe.tags.join(' · ')}</span>}
        </span>
        <ChevronRight className="size-4.5 shrink-0 text-muted" />
      </Link>
      <button
        type="button"
        aria-label={recipe.is_favorite ? `Fjern ${recipe.name} fra favoritter` : `Gør ${recipe.name} til favorit`}
        aria-pressed={recipe.is_favorite}
        onClick={() => fav.mutate({ id: recipe.id, value: !recipe.is_favorite })}
        className="pressable flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Star className={cn('size-5', recipe.is_favorite ? 'fill-current text-notice' : 'text-muted')} />
      </button>
    </div>
  )
}
