import { BookOpen, CalendarPlus, Clock, Pencil, Star, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { Stepper } from '@/components/ui/Stepper'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatLongDate, toIsoDate } from '@/lib/dates'
import { formatQuantity, isUnit, scaleMilli, weekStart } from '@/lib/recipes'
import { useMealHistory, useRecipe, useRecipes, useSetFavorite } from './api'
import { EntrySheet, type EntryTarget } from './EntrySheet'

export function RecipePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipe = useRecipe(id)
  const recipes = useRecipes()
  const history = useMealHistory()
  const fav = useSetFavorite()
  const { members } = useHousehold()
  const [servings, setServings] = useState<number | null>(null)
  const [plan, setPlan] = useState<EntryTarget | null>(null)

  if (recipe.isPending) return <FullScreenLoader />
  const r = recipe.data
  if (!r)
    return (
      <>
        <PageHeader title="Opskrift" back="/hjemmet/madplan?vis=opskrifter" />
        <EmptyState icon={BookOpen} title="Opskriften findes ikke" text="Den kan være slettet på den anden telefon." />
      </>
    )

  const shown = servings ?? r.servings
  const creator = members.find((m) => m.userId === r.created_by)
  const today = toIsoDate(new Date())
  const lastUsed = (history.data ?? []).find((e) => e.recipe_id === r.id && e.plan_date <= today)

  return (
    <>
      <PageHeader
        title={r.name}
        eyebrow={r.category ?? undefined}
        back="/hjemmet/madplan?vis=opskrifter"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={r.is_favorite ? 'Fjern fra favoritter' : 'Gør til favorit'}
              aria-pressed={r.is_favorite}
              onClick={() => fav.mutate({ id: r.id, value: !r.is_favorite })}
              className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card"
            >
              <Star className={cn('size-5', r.is_favorite ? 'fill-current text-notice' : 'text-secondary')} />
            </button>
            <button type="button" aria-label="Redigér opskrift" onClick={() => navigate(`/hjemmet/madplan/opskrift/${r.id}/rediger`)} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
              <Pencil className="size-4.5" />
            </button>
          </div>
        }
      />

      {r.description && <p className="text-[16px] text-secondary">{r.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
        {r.prep_minutes ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-secondary px-3">
            <Clock className="size-3.5" /> {r.prep_minutes} min.
          </span>
        ) : null}
        {r.tags.map((t) => (
          <span key={t} className="inline-flex h-8 items-center rounded-full bg-notice-soft px-3">
            {t}
          </span>
        ))}
      </div>

      <Button block className="mt-5" onClick={() => setPlan({ date: today, recipeId: r.id })}>
        <CalendarPlus className="size-5" /> Sæt på madplanen
      </Button>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-tight">Ingredienser</h2>
        <Stepper label="Portioner" value={shown} onChange={setServings} unit="pers." />
      </div>
      {shown !== r.servings && (
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-secondary">
          <Users className="size-3.5" /> Omregnet fra {r.servings} til {shown} personer
        </p>
      )}
      {r.ingredients.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface-secondary p-4 text-[15px] text-secondary">Ingen ingredienser endnu.</p>
      ) : (
        <Card padded={false} className="mt-3">
          <ul aria-label="Ingredienser" className="divide-y divide-subtle">
            {r.ingredients.map((i) => {
              const q = formatQuantity(i.amount_milli === null ? null : scaleMilli(i.amount_milli, r.servings, shown), isUnit(i.unit) ? i.unit : null)
              return (
                <li key={i.id} className="flex items-baseline gap-3 px-4 py-3">
                  <span className="tabular w-24 shrink-0 text-[15px] font-semibold">{q || '–'}</span>
                  <span className="min-w-0 flex-1 text-[15px]">
                    {i.name}
                    {i.note && <span className="text-secondary"> ({i.note})</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {r.steps && (
        <>
          <SectionHeader title="Fremgangsmåde" />
          <Card>
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{r.steps}</p>
          </Card>
        </>
      )}
      {r.note && (
        <>
          <SectionHeader title="Note" />
          <Card variant="tonal">
            <p className="whitespace-pre-wrap break-words text-[15px]">
              {r.note.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline">
                    {(() => {
                      try {
                        return new URL(part).hostname.replace(/^www\./, '')
                      } catch {
                        return part
                      }
                    })()}
                  </a>
                ) : (
                  part
                ),
              )}
            </p>
          </Card>
        </>
      )}

      <p className="mt-6 px-1 text-[13px] text-secondary">
        Oprettet af {creator?.displayName ?? 'ukendt'} · {formatLongDate(new Date(r.created_at))}
        {lastUsed && ` · Sidst på madplanen ${formatLongDate(new Date(`${lastUsed.plan_date}T12:00:00`))}`}
      </p>

      <EntrySheet target={plan} monday={weekStart(plan?.date ?? today)} recipes={recipes.data ?? [r]} recentIds={[]} onClose={() => setPlan(null)} />
    </>
  )
}
