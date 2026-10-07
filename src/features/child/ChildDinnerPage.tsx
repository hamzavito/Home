import { BookOpen, Clock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { useRecipe } from '@/features/mealplan/api'
import { formatQuantity, isUnit } from '@/lib/recipes'

/** Aftensmadens opskrift – kun til at læse */
export function ChildDinnerPage({ id }: { id: string }) {
  const recipe = useRecipe(id)
  if (recipe.isPending) return <FullScreenLoader />
  const r = recipe.data
  if (!r)
    return (
      <>
        <PageHeader title="Opskrift" back="/" />
        <EmptyState icon={BookOpen} title="Opskriften findes ikke" />
      </>
    )
  return (
    <>
      <PageHeader title={r.name} eyebrow="I aften" back="/" />
      {r.description && <p className="text-[16px] text-secondary">{r.description}</p>}
      {r.prep_minutes ? (
        <p className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-secondary px-3 text-[13px] font-semibold">
          <Clock className="size-3.5" /> {r.prep_minutes} min.
        </p>
      ) : null}
      {r.ingredients.length > 0 && (
        <>
          <SectionHeader title={`Ingredienser · ${r.servings} pers.`} />
          <Card padded={false}>
            <ul aria-label="Ingredienser" className="divide-y divide-subtle">
              {r.ingredients.map((i) => (
                <li key={i.id} className="flex items-baseline gap-3 px-4 py-3">
                  <span className="tabular w-24 shrink-0 text-[15px] font-semibold">{formatQuantity(i.amount_milli, isUnit(i.unit) ? i.unit : null) || '–'}</span>
                  <span className="min-w-0 flex-1 text-[15px]">{i.name}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {r.steps && (
        <>
          <SectionHeader title="Fremgangsmåde" />
          <Card>
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{r.steps}</p>
          </Card>
        </>
      )}
    </>
  )
}
