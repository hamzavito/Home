import { CalendarClock, Check, ExternalLink, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, TextArea, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { today, useCategories } from '@/features/finance/api'
import { CategoryPicker } from '@/features/finance/CategoryPicker'
import { decodePaidBy, encodePaidBy, paidByOptions } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatLongDate, fromIsoDate } from '@/lib/dates'
import { formatAmount, parseKr, toInputValue } from '@/lib/money'
import { upcomingErrorMessage, useDeleteUpcoming, useSaveUpcoming, useSetUpcomingStatus, useUndoPayment, useUpcoming, type Upcoming } from './api'
import { dueLabel } from './UpcomingPage'

export function UpcomingFormPage() {
  const { id } = useParams()
  const upcoming = useUpcoming()
  const categories = useCategories()
  if (upcoming.isPending || categories.isPending) return <FullScreenLoader />
  const existing = id ? upcoming.data?.find((u) => u.id === id) : undefined
  if (id && !existing)
    return (
      <>
        <PageHeader title="Kommende udgift" back="/okonomi/kommende" />
        <EmptyState icon={CalendarClock} title="Udgiften findes ikke" />
      </>
    )
  return <UpcomingForm key={id ?? 'new'} existing={existing} />
}

function UpcomingForm({ existing }: { existing?: Upcoming }) {
  const navigate = useNavigate()
  const categories = useCategories()
  const save = useSaveUpcoming()
  const del = useDeleteUpcoming()
  const setStatus = useSetUpcomingStatus()
  const undo = useUndoPayment()
  const choices = (categories.data ?? []).filter((c) => !c.archived_at || c.id === existing?.category_id)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [amount, setAmount] = useState(existing ? toInputValue(existing.amount_ore) : '')
  const [due, setDue] = useState(existing?.due_on ?? today())
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? (choices.find((c) => c.kind === 'reserve')?.id ?? null))
  const [note, setNote] = useState(existing?.note ?? '')
  const [touched, setTouched] = useState(false)
  const [sheet, setSheet] = useState<'pay' | 'delete' | null>(null)

  const ore = parseKr(amount)
  const errors = { title: title.trim() ? null : 'Skriv hvad udgiften er', amount: ore && ore > 0 ? null : 'Skriv beløbet', category: categoryId ? null : 'Vælg budget' }
  const valid = !errors.title && !errors.amount && !errors.category
  const isOpen = !existing || existing.status === 'upcoming'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    try {
      await save.mutateAsync({ id: existing?.id, input: { title, amountOre: ore!, dueOn: due, categoryId: categoryId!, note } })
      navigate('/okonomi/kommende', { replace: true })
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader
        title={existing ? existing.title : 'Ny kommende udgift'}
        eyebrow={existing ? (existing.status === 'paid' ? 'Betalt' : existing.status === 'cancelled' ? 'Annulleret' : dueLabel(existing.due_on)) : undefined}
        back="/okonomi/kommende"
        action={
          existing && (
            <button type="button" aria-label="Slet kommende udgift" onClick={() => setSheet('delete')} className="pressable flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      {existing && existing.status === 'upcoming' && (
        <Button block className="mb-5" onClick={() => setSheet('pay')}>
          <Check className="size-5" strokeWidth={2.6} /> Markér som betalt
        </Button>
      )}
      {existing?.status === 'paid' && (
        <Card variant="tonal" className="mb-5 p-4">
          <p className="text-[15px] font-semibold">Betalt {existing.paid_at ? formatLongDate(new Date(existing.paid_at)) : ''}</p>
          <p className="mt-0.5 text-[13px] text-secondary">{existing.transaction_id ? 'Registreret som udgift og trukket fra budgettet.' : 'Markeret som betalt uden at blive registreret som udgift.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {existing.transaction_id && (
              <Button size="sm" variant="surface" onClick={() => navigate(`/okonomi/udgift/${existing.transaction_id}`)}>
                <ExternalLink className="size-4" /> Se udgiften
              </Button>
            )}
            <Button size="sm" variant="surface" loading={undo.isPending} onClick={() => undo.mutate(existing.id)}>
              <RotateCcw className="size-4" /> Fortryd betaling
            </Button>
          </div>
          {existing.transaction_id && <p className="mt-2 text-[12px] text-secondary">"Fortryd betaling" sletter også den registrerede udgift.</p>}
        </Card>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" disabled={!isOpen} autoFocus={!existing} />
          {touched && errors.amount && <p className="mt-1 px-1 text-center text-[13px] text-danger">{errors.amount}</p>}
        </div>
        <Field label="Hvad" error={touched ? errors.title : null}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Tandlæge" maxLength={80} disabled={!isOpen} autoCapitalize="sentences" />
        </Field>
        <Field label="Dato" hint={formatLongDate(fromIsoDate(due))}>
          <TextInput type="date" value={due} onChange={(e) => e.target.value && setDue(e.target.value)} disabled={!isOpen} />
        </Field>
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Budget</p>
          <CategoryPicker categories={choices} value={categoryId} onChange={(id) => isOpen && setCategoryId(id)} />
          {touched && errors.category && <p className="mt-1 px-1 text-[13px] text-danger">{errors.category}</p>}
        </div>
        <Field label="Note (valgfri)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} disabled={!isOpen} />
        </Field>
        {save.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">{upcomingErrorMessage(save.error)}</p>}
        {isOpen && (
          <Button type="submit" block variant={existing ? 'secondary' : 'primary'} loading={save.isPending}>
            {existing ? 'Gem ændringer' : 'Gem kommende udgift'}
          </Button>
        )}
      </form>

      {existing?.status === 'upcoming' && (
        <ListGroup className="mt-6">
          <ListRow icon={XCircle} iconColor="var(--text-secondary)" title="Annullér udgiften" subtitle="Den bliver ikke til noget" onClick={() => setStatus.mutate({ id: existing.id, status: 'cancelled' })} />
        </ListGroup>
      )}
      {existing?.status === 'cancelled' && (
        <ListGroup className="mt-6">
          <ListRow icon={RotateCcw} title="Gør aktiv igen" onClick={() => setStatus.mutate({ id: existing.id, status: 'upcoming' })} />
        </ListGroup>
      )}

      <BottomSheet open={sheet === 'pay'} onClose={() => setSheet(null)} title="Markér som betalt">
        {sheet === 'pay' && existing && <PayForm u={existing} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Slet kommende udgift?">
        {sheet === 'delete' && existing && (
          <>
            <p className="text-[15px] text-secondary">
              {existing.transaction_id ? 'Den registrerede udgift bevares i økonomien.' : 'Planen fjernes. Det påvirker ikke budgettet.'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setSheet(null)}>
                Annullér
              </Button>
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(existing.id, { onSuccess: () => navigate('/okonomi/kommende', { replace: true }) })}>
                Slet
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </>
  )
}

function PayForm({ u, onDone }: { u: Upcoming; onDone: () => void }) {
  const { me, members } = useHousehold()
  const setStatus = useSetUpcomingStatus()
  const [amount, setAmount] = useState(toInputValue(u.amount_ore))
  const [paidOn, setPaidOn] = useState(today())
  const [paidBy, setPaidBy] = useState(encodePaidBy('member', me.userId))
  const ore = parseKr(amount)
  return (
    <>
      <p className="text-[17px] font-semibold">Vil du registrere denne som en udgift?</p>
      <p className="mt-1 text-[14px] text-secondary">Så trækkes beløbet fra budgettet. Den oprettes kun én gang.</p>
      <div className="mt-4 space-y-4">
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Betalt beløb i kroner" />
        <Field label="Betalt den">
          <TextInput type="date" value={paidOn} onChange={(e) => e.target.value && setPaidOn(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Betalt af</p>
          <SegmentedControl label="Betalt af" options={paidByOptions(members)} value={paidBy} onChange={setPaidBy} />
        </div>
      </div>
      {setStatus.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{upcomingErrorMessage(setStatus.error)}</p>}
      <div className="mt-5 space-y-2">
        <Button
          block
          disabled={!ore || ore <= 0}
          loading={setStatus.isPending && setStatus.variables?.register === true}
          onClick={() => setStatus.mutate({ id: u.id, status: 'paid', register: true, amountOre: ore, paidOn, paidBy: decodePaidBy(paidBy) }, { onSuccess: onDone })}
        >
          Ja, registrér {ore ? `${formatAmount(ore)} kr.` : ''}
        </Button>
        <Button block variant="secondary" loading={setStatus.isPending && setStatus.variables?.register === false} onClick={() => setStatus.mutate({ id: u.id, status: 'paid', register: false }, { onSuccess: onDone })}>
          Nej, markér kun som betalt
        </Button>
      </div>
    </>
  )
}
