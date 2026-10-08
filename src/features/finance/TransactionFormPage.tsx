import { ChevronRight, Trash2, WalletCards } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { sections } from '@/app/sections'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, TextArea, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { useGoBack } from '@/app/useGoBack'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatLongDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { parseKr, toInputValue } from '@/lib/money'
import { errorMessage, today, useCategories, useDeleteTransaction, useSaveTransaction, useTransaction, type Transaction } from './api'
import { CategoryPicker } from './CategoryPicker'
import { decodePaidBy, defaultPaidBy, encodePaidBy, paidByLabel, paidByOptions } from './paidBy'
import { useReceiptForTransaction, useSignedUrls } from '@/features/receipts/api'
import { ReceiptImageActions } from '@/features/receipts/ReceiptImageActions'
import { ReceiptThumb } from '@/features/receipts/ReceiptThumb'
import { retentionBadge } from '@/lib/retention'

export function TransactionFormPage() {
  const { id } = useParams()
  const tx = useTransaction(id)
  const categories = useCategories()

  if (categories.isPending || (id && tx.isPending)) return <FullScreenLoader />
  if (id && !tx.data)
    return (
      <>
        <PageHeader title="Udgift" back />
        <EmptyState icon={WalletCards} title="Udgiften findes ikke" text="Den kan være slettet." />
      </>
    )
  return <TransactionForm key={id ?? 'new'} existing={tx.data ?? null} categories={categories.data ?? []} />
}

function TransactionForm({ existing, categories }: { existing: Transaction | null; categories: NonNullable<ReturnType<typeof useCategories>['data']> }) {
  const navigate = useNavigate()
  const { members, me } = useHousehold()
  const save = useSaveTransaction()
  const del = useDeleteTransaction()

  const [amount, setAmount] = useState(existing ? toInputValue(existing.amount_ore) : '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [date, setDate] = useState(existing?.occurred_on ?? today())
  const [paidBy, setPaidBy] = useState(existing ? encodePaidBy(existing.paid_by_kind, existing.paid_by_user_id) : defaultPaidBy(me))
  const [note, setNote] = useState(existing?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touched, setTouched] = useState(false)

  // Aktive kategorier + den nuværende, hvis den er arkiveret
  const choices = categories.filter((c) => !c.archived_at || c.id === existing?.category_id)
  // Ny udgift: vælg automatisk kategorien, hvis der kun er én
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? (choices.length === 1 ? choices[0]!.id : null))

  const amountOre = parseKr(amount)
  const errors = {
    amount: amountOre === null || amountOre <= 0 ? 'Skriv et beløb, fx 638,75' : null,
    description: description.trim().length === 0 ? 'Skriv hvad udgiften var' : null,
    category: categoryId ? null : 'Vælg en kategori',
  }
  const valid = !errors.amount && !errors.description && !errors.category

  const back = useGoBack()
  const goBack = () => back('/okonomi')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: { categoryId: categoryId!, amountOre: amountOre!, occurredOn: date, description, note, paidBy: decodePaidBy(paidBy) },
      })
      goBack()
    } catch {
      // Fejlen vises via save.isError
    }
  }

  if (categories.filter((c) => !c.archived_at).length === 0 && !existing)
    return (
      <>
        <PageHeader title="Ny udgift" back />
        <EmptyState icon={WalletCards} title="Opret en budgetkategori først" text="Udgifter registreres altid på en kategori, så budgettet opdateres.">
          <Button onClick={() => navigate(sections.budgets.path)}>Gå til budgetter</Button>
        </EmptyState>
      </>
    )

  const isToday = date === today()
  const now = new Date()
  const yesterday = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))

  return (
    <>
      <PageHeader
        title={existing ? 'Redigér udgift' : 'Ny udgift'}
        back
        action={
          existing && (
            <button type="button" aria-label="Slet udgift" onClick={() => setConfirmDelete(true)} className="pressable flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" autoFocus={!existing} />
          {touched && errors.amount && <p className="mt-1 px-1 text-center text-[13px] text-danger">{errors.amount}</p>}
        </div>

        <Field label="Hvad" error={touched ? errors.description : null}>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fx Bilka" maxLength={80} autoCapitalize="sentences" />
        </Field>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Kategori</p>
          <CategoryPicker categories={choices} value={categoryId} onChange={setCategoryId} />
          {touched && errors.category && <p className="mt-1 px-1 text-[13px] text-danger">{errors.category}</p>}
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Betalt af</p>
          <SegmentedControl label="Betalt af" options={paidByOptions(members)} value={paidBy} onChange={setPaidBy} />
        </div>

        <Field label="Dato" hint={formatLongDate(fromIsoDate(date))}>
          <div className="flex gap-2">
            <TextInput type="date" value={date} max="2100-12-31" onChange={(e) => e.target.value && setDate(e.target.value)} className="flex-1" />
            <Button type="button" size="sm" variant={isToday ? 'primary' : 'secondary'} className="h-13" onClick={() => setDate(today())}>
              I dag
            </Button>
            <Button type="button" size="sm" variant={date === yesterday ? 'primary' : 'secondary'} className="h-13" onClick={() => setDate(yesterday)}>
              I går
            </Button>
          </div>
        </Field>

        <Field label="Note (valgfri)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} />
        </Field>

        {existing && <LinkedReceipt transactionId={existing.id} />}

        {existing && (
          <p className="px-1 text-[13px] text-muted">
            Registreret af {paidByLabel('member', existing.created_by, members)} · {formatLongDate(new Date(existing.created_at))}
          </p>
        )}

        {save.isError && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
            {errorMessage(save.error)}
          </p>
        )}

        <Button type="submit" block loading={save.isPending}>
          {existing ? 'Gem ændringer' : 'Gem udgift'}
        </Button>
      </form>

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Slet udgift?">
        <p className="text-[15px] text-secondary">
          Udgiften fjernes, og budgettet opdateres{existing?.source === 'receipt' ? '. Kvitteringen og dens billede slettes også' : ''}. Det kan ikke fortrydes.
        </p>
        {del.isError && <p className="mt-3 text-[14px] text-danger">{errorMessage(del.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Annullér
          </Button>
          <Button
            variant="danger"
            loading={del.isPending}
            onClick={async () => {
              try {
                await del.mutateAsync(existing!.id)
                setConfirmDelete(false)
                goBack()
              } catch {
                // Fejlen vises via del.isError
              }
            }}
          >
            Slet
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

/** Kvitteringen på udgiften: se, tilføj, udskift, drej eller fjern billedet. */
function LinkedReceipt({ transactionId }: { transactionId: string }) {
  const receipt = useReceiptForTransaction(transactionId)
  const r = receipt.data
  const urls = useSignedUrls(r?.storage_path ? [r.storage_path] : [])
  if (receipt.isPending) return null
  return (
    <section aria-label="Kvittering" className="space-y-2">
      {r && (
        <Link to={`/kvitteringer/${r.id}`} className="pressable flex items-center gap-3 rounded-card bg-surface-primary p-3 shadow-card">
          <ReceiptThumb url={r.storage_path ? urls.data?.get(r.storage_path) : undefined} deleted={Boolean(r.image_deleted_at)} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Kvittering</p>
            <p className="text-[13px] text-secondary">{retentionBadge({ deleteAt: r.delete_at, imageDeletedAt: r.image_deleted_at })}</p>
          </div>
          <ChevronRight className="size-5 text-muted" />
        </Link>
      )}
      <ReceiptImageActions transactionId={transactionId} receipt={r} />
    </section>
  )
}
