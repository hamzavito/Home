import { Banknote, Landmark, Plus } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, TextInput } from '@/components/ui/Field'
import { ListGroup } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Spinner'
import { decodePaidBy, defaultPaidBy, encodePaidBy, paidByLabel, paidByOptions } from '@/features/finance/paidBy'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'
import { formatShortDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { parseKr, toInputValue } from '@/lib/money'
import { useDeleteIncome, useMonthIncome, useSaveIncome, type IncomeEntry } from './api'

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return toIsoDate(new Date(y!, mo!, 1, 12))
}

/** Faktiske indtægter (fra banken eller tilføjet i hånden). Planlagt løn ligger under Faste poster. */
export function IncomePage() {
  const { members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const income = useMonthIncome(month, nextMonth(month))
  const [edit, setEdit] = useState<IncomeEntry | 'new' | null>(null)
  const list = income.data ?? []
  const total = list.reduce((s, x) => s + x.amount_ore, 0)

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <div className="mb-2 mt-5 flex items-center justify-between px-1">
        <div>
          <p className="text-[13px] font-semibold text-secondary">Indtægter i alt</p>
          <Money ore={total} size="lg" className="text-positive" />
        </div>
        <Button size="sm" onClick={() => setEdit('new')}>
          <Plus className="size-4" strokeWidth={2.6} /> Indtægt
        </Button>
      </div>
      {income.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : list.length === 0 ? (
        <EmptyState icon={Banknote} title="Ingen indtægter denne måned" text="Forbind din bank, så kommer løn og andre indtægter automatisk – eller tilføj dem selv." compact />
      ) : (
        <ListGroup>
          {list.map((x) => (
            <button key={x.id} type="button" onClick={() => setEdit(x)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-secondary">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[16px] font-medium">{x.description}</span>
                <span className="truncate text-[13px] text-secondary">
                  {formatShortDate(fromIsoDate(x.received_on))} · {paidByLabel(x.received_by_kind, x.received_by_user_id, members)}
                  {x.source === 'bank' && ' · Fra banken'}
                </span>
              </span>
              {x.source === 'bank' && <Landmark className="size-4 shrink-0 text-muted" aria-hidden />}
              <Money ore={x.amount_ore} sign="income" className="text-positive" decimals="always" />
            </button>
          ))}
        </ListGroup>
      )}
      <BottomSheet open={edit !== null} onClose={() => setEdit(null)} title={edit === 'new' ? 'Ny indtægt' : 'Indtægt'}>
        {edit && <IncomeForm key={edit === 'new' ? 'new' : edit.id} existing={edit === 'new' ? null : edit} onDone={() => setEdit(null)} />}
      </BottomSheet>
    </>
  )
}

function IncomeForm({ existing, onDone }: { existing: IncomeEntry | null; onDone: () => void }) {
  const { members, me } = useHousehold()
  const save = useSaveIncome()
  const del = useDeleteIncome()
  const [amount, setAmount] = useState(existing ? toInputValue(existing.amount_ore) : '')
  const [description, setDescription] = useState(existing?.description ?? 'Løn')
  const [date, setDate] = useState(existing?.received_on ?? toIsoDate(new Date()))
  const [who, setWho] = useState(existing ? encodePaidBy(existing.received_by_kind, existing.received_by_user_id) : defaultPaidBy(me))
  const ore = parseKr(amount)
  const valid = ore !== null && ore > 0 && description.trim().length > 0
  const error = save.error ?? del.error
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate({ id: existing?.id, amountOre: ore!, receivedOn: date, description, paidBy: decodePaidBy(who) }, { onSuccess: onDone })
      }}
      className="space-y-4"
    >
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" />
      <Field label="Hvad">
        <TextInput value={description} maxLength={80} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Dato">
        <TextInput type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvis indtægt</p>
        <SegmentedControl label="Hvis indtægt" options={paidByOptions(members)} value={who} onChange={setWho} />
      </div>
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{isReadOnlyError(error) ? READ_ONLY_MESSAGE : 'Det kunne ikke gemmes. Prøv igen.'}</p>}
      <Button type="submit" block disabled={!valid} loading={save.isPending}>
        Gem
      </Button>
      {existing && (
        <Button type="button" variant="danger" block loading={del.isPending} onClick={() => del.mutate(existing.id, { onSuccess: onDone })}>
          Slet indtægt
        </Button>
      )}
    </form>
  )
}
