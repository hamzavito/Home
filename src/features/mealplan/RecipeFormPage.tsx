import { BookOpen, Link2, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { Stepper } from '@/components/ui/Stepper'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/lib/cn'
import { CATEGORY_SUGGESTIONS, cleanTag, formatAmount, normalizeName, parseAmount, parseIngredientLine, TAG_SUGGESTIONS, UNITS, withSuggestions } from '@/lib/recipes'
import { importErrorMessage, mealErrorMessage, useArchiveRecipe, useImportRecipe, useRecipe, useRecipes, useSaveRecipe, type ImportedRecipe, type RecipeWithIngredients } from './api'

type Row = { key: number; amount: string; unit: string; name: string; note: string }

let rowKey = 0
const emptyRow = (): Row => ({ key: rowKey++, amount: '', unit: '', name: '', note: '' })

export function RecipeFormPage() {
  const { id } = useParams()
  const recipe = useRecipe(id)
  if (id && recipe.isPending) return <FullScreenLoader />
  if (id && !recipe.data)
    return (
      <>
        <PageHeader title="Opskrift" back="/hjemmet/madplan?vis=opskrifter" />
        <EmptyState icon={BookOpen} title="Opskriften findes ikke" text="Den kan være slettet på den anden telefon." />
      </>
    )
  return <RecipeForm key={id ?? 'ny'} existing={recipe.data ?? undefined} />
}

function RecipeForm({ existing }: { existing?: RecipeWithIngredients }) {
  const navigate = useNavigate()
  const all = useRecipes()
  const save = useSaveRecipe()
  const archive = useArchiveRecipe()
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [servings, setServings] = useState(existing?.servings ?? 4)
  const [prep, setPrep] = useState(existing?.prep_minutes ? String(existing.prep_minutes) : '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [newTag, setNewTag] = useState('')
  const [rows, setRows] = useState<Row[]>(() =>
    existing?.ingredients.length
      ? existing.ingredients.map((i) => ({ key: rowKey++, amount: i.amount_milli === null ? '' : formatAmount(i.amount_milli), unit: i.unit ?? '', name: i.name, note: i.note ?? '' }))
      : [emptyRow(), emptyRow(), emptyRow()],
  )
  const [steps, setSteps] = useState(existing?.steps ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [favorite, setFavorite] = useState(existing?.is_favorite ?? false)
  const [touched, setTouched] = useState(false)
  const [link, setLink] = useState('')
  const [imported, setImported] = useState<string | null>(null)
  const importRecipe = useImportRecipe()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const usedCategories = (all.data ?? []).map((r) => r.category).filter((c): c is string => Boolean(c))
  const categoryOptions = withSuggestions(CATEGORY_SUGGESTIONS, usedCategories)
  const tagOptions = withSuggestions(TAG_SUGGESTIONS, [...(all.data ?? []).flatMap((r) => r.tags), ...tags])
  const back = existing ? `/hjemmet/madplan/opskrift/${existing.id}` : '/hjemmet/madplan?vis=opskrifter'

  const prepMinutes = prep.trim() ? Number(prep) : null
  const amountErrors = rows.map((r) => (r.amount.trim() && parseAmount(r.amount) === undefined ? 'Ugyldig mængde' : null))
  const errors = {
    name: name.trim() ? null : 'Giv opskriften et navn',
    prep: prepMinutes === null || (Number.isInteger(prepMinutes) && prepMinutes >= 0 && prepMinutes <= 1440) ? null : 'Skriv minutter (0–1440)',
    amounts: amountErrors.some(Boolean),
  }
  const valid = !errors.name && !errors.prep && !errors.amounts

  /** Udfyld formularen med en opskrift fra et link – brugeren tjekker og gemmer selv */
  function fillFrom(r: ImportedRecipe, source: string) {
    setName(r.name)
    setDescription(r.description ?? '')
    if (r.servings) setServings(r.servings)
    setPrep(r.prepMinutes ? String(r.prepMinutes) : '')
    setSteps(r.steps ?? '')
    setNote((n) => [n.trim(), `Kilde: ${source}`].filter(Boolean).join('\n'))
    const parsed = r.ingredients.map(parseIngredientLine)
    setRows(
      parsed.length
        ? parsed.map((p) => ({ key: rowKey++, amount: p.amount_milli === null ? '' : formatAmount(p.amount_milli), unit: p.unit ?? '', name: p.name.slice(0, 80), note: (p.note ?? '').slice(0, 200) }))
        : [emptyRow(), emptyRow(), emptyRow()],
    )
    setImported(new URL(source).hostname.replace(/^www\./, ''))
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function toggleTag(t: string) {
    setTags((ts) => (ts.some((x) => normalizeName(x) === normalizeName(t)) ? ts.filter((x) => normalizeName(x) !== normalizeName(t)) : [...ts, t]))
  }

  function addTag() {
    const t = cleanTag(newTag)
    if (!t) return
    if (!tags.some((x) => normalizeName(x) === normalizeName(t))) setTags((ts) => [...ts, t])
    setNewTag('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || save.isPending) return
    try {
      const rid = await save.mutateAsync({
        id: existing?.id,
        recipe: {
          name: name.trim(),
          description: description.trim() || null,
          servings,
          prep_minutes: prepMinutes,
          steps: steps.trim() || null,
          category: category.trim() || null,
          tags: tags.map(cleanTag).filter(Boolean),
          is_favorite: favorite,
          note: note.trim() || null,
        },
        ingredients: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), amount_milli: parseAmount(r.amount) ?? null, unit: r.unit || null, note: r.note.trim() || null })),
      })
      navigate(`/hjemmet/madplan/opskrift/${rid}`, { replace: true })
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader
        title={existing ? 'Redigér opskrift' : 'Ny opskrift'}
        back={back}
        action={
          existing && (
            <button type="button" aria-label="Slet opskrift" onClick={() => setConfirmDelete(true)} className="pressable flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      {!existing && (
        <div className="mb-5 rounded-card bg-notice-soft p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Link2 className="size-4.5 text-notice" /> Hent fra link
          </p>
          <p className="mt-0.5 text-[13px] text-secondary">Indsæt linket til en opskrift, fx fra Arla eller Valdemarsro. Du tjekker den, før den gemmes.</p>
          <form
            className="mt-3 flex gap-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (!link.trim() || importRecipe.isPending) return
              setImported(null)
              importRecipe.mutate(link.trim(), { onSuccess: ({ recipe, source }) => fillFrom(recipe, source) })
            }}
          >
            <TextInput
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              aria-label="Link til opskrift"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1"
            />
            <Button type="submit" className="h-13 shrink-0" disabled={!link.trim()} loading={importRecipe.isPending}>
              Hent
            </Button>
          </form>
          {importRecipe.isError && <p className="mt-2 text-[13px] font-medium text-danger">{importErrorMessage(importRecipe.error.message)}</p>}
          {imported && <p className="mt-2 text-[13px] font-semibold text-positive">Hentet fra {imported}. Tjek ingredienserne og gem.</p>}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Navn" error={touched ? errors.name : null}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Kylling i karry" maxLength={100} autoCapitalize="sentences" autoFocus={!existing} />
        </Field>
        <Field label="Beskrivelse (valgfri)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="Fx Mild karry med ris – børnene elsker den" />
        </Field>

        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Portioner</p>
            <Stepper label="Portioner" value={servings} onChange={setServings} unit="pers." />
          </div>
          <Field label="Tid (minutter)" error={touched ? errors.prep : null}>
            <TextInput value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Fx 40" maxLength={4} />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Kategori</p>
          <div role="radiogroup" aria-label="Kategori" className="flex flex-wrap gap-2">
            {categoryOptions.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={normalizeName(category) === normalizeName(c)}
                onClick={() => setCategory(normalizeName(category) === normalizeName(c) ? '' : c)}
                className={cn('pressable h-9 rounded-full px-3.5 text-[13px] font-semibold', normalizeName(category) === normalizeName(c) ? 'bg-accent text-on-accent' : 'bg-surface-primary shadow-card')}
              >
                {c}
              </button>
            ))}
          </div>
          <TextInput className="mt-2" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Eller skriv en ny kategori" aria-label="Egen kategori" maxLength={40} autoCapitalize="sentences" />
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Tags</p>
          <div aria-label="Tags" role="group" className="flex flex-wrap gap-2">
            {tagOptions.map((t) => {
              const on = tags.some((x) => normalizeName(x) === normalizeName(t))
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => toggleTag(t)} className={cn('pressable h-9 rounded-full px-3.5 text-[13px] font-semibold', on ? 'bg-surface-inverse text-on-inverse' : 'bg-surface-primary shadow-card')}>
                  {t}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <TextInput
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Nyt tag, fx Weekend"
              aria-label="Nyt tag"
              maxLength={30}
              className="flex-1"
            />
            <Button type="button" variant="secondary" className="h-13 shrink-0" aria-label="Tilføj tag" disabled={!cleanTag(newTag)} onClick={addTag}>
              Tilføj
            </Button>
          </div>
        </div>

        <section aria-label="Ingredienser">
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Ingredienser (til {servings} pers.)</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="rounded-2xl bg-surface-primary p-2.5 shadow-card">
                <div className="flex items-center gap-2">
                  <TextInput value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} placeholder="Ingrediens, fx Løg" aria-label={`Ingrediens ${i + 1}`} maxLength={80} className="h-11 flex-1 px-3 shadow-none" autoCapitalize="sentences" />
                  <button type="button" aria-label={`Fjern ingrediens ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="pressable flex size-9 shrink-0 items-center justify-center rounded-full text-secondary">
                    <X className="size-4.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-[4.5rem_5.25rem_minmax(0,1fr)] gap-2">
                  <TextInput value={r.amount} onChange={(e) => updateRow(r.key, { amount: e.target.value })} inputMode="decimal" placeholder="Antal" aria-label={`Mængde ${i + 1}`} className="h-10 px-3 text-[15px] shadow-none" />
                  <SelectInput value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} aria-label={`Enhed ${i + 1}`} className="h-10 px-3 pr-8 text-[15px] shadow-none">
                    <option value="">–</option>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </SelectInput>
                  <TextInput value={r.note} onChange={(e) => updateRow(r.key, { note: e.target.value })} placeholder="Note" aria-label={`Note ${i + 1}`} maxLength={200} className="h-10 px-3 text-[15px] shadow-none" />
                </div>
                {touched && amountErrors[i] && <p className="mt-1 px-1 text-[13px] text-danger">{amountErrors[i]} – fx 2, 1,5 eller ½</p>}
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" className="mt-1" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Plus className="size-4.5" /> Tilføj ingrediens
          </Button>
        </section>

        <Field label="Fremgangsmåde">
          <TextArea value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={10000} rows={6} placeholder={'1. Skær kyllingen i tern\n2. …'} />
        </Field>
        <Field label="Note (valgfri)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} placeholder="Fx Dobbelt portion kan fryses" />
        </Field>
        <div className="overflow-hidden rounded-2xl bg-surface-primary shadow-card ring-1 ring-subtle">
          <Toggle label="Favorit" checked={favorite} onChange={setFavorite} />
        </div>

        {save.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">{mealErrorMessage(save.error)}</p>}
        <Button type="submit" block loading={save.isPending}>
          {existing ? 'Gem ændringer' : 'Gem opskrift'}
        </Button>
      </form>

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Slet opskrift?">
        <p className="text-[15px] text-secondary">Opskriften fjernes fra listen. Tidligere ugeplaner beholder retten.</p>
        {archive.isError && <p className="mt-3 text-[14px] text-danger">{mealErrorMessage(archive.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Annullér
          </Button>
          <Button variant="danger" loading={archive.isPending} onClick={() => existing && archive.mutate(existing.id, { onSuccess: () => navigate('/hjemmet/madplan?vis=opskrifter', { replace: true }) })}>
            Slet
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
