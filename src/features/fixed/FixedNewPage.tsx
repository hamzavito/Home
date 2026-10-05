import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { AmountInput, Field, TextArea, TextInput } from '@/components/ui/Field'
import { MonthStepper } from '@/components/ui/MonthStepper'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { decodePaidBy, encodePaidBy, paidByOptions } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { monthKey } from '@/lib/dates'
import { formatAmount, parseKr } from '@/lib/money'
import type { FixedKind, Frequency } from '@/types/database'
import { fixedErrorMessage, useCreateFixedItem, useFixedGroups } from './api'
import { FrequencyPicker, selectCls } from './FrequencyPicker'

export function FixedNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const kind: FixedKind = params.get('type') === 'income' ? 'income' : 'expense'
  const { me, members } = useHousehold()
  const groups = useFixedGroups()
  const create = useCreateFixedItem()

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [negative, setNegative] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [dueMonth, setDueMonth] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [owner, setOwner] = useState(encodePaidBy('member', me.userId))
  const [startMonth, setStartMonth] = useState(monthKey(new Date()))
  const [paymentDay, setPaymentDay] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const ore = parseKr(amount)
  const activeGroups = (groups.data ?? []).filter((g) => !g.archived_at)
  const errors = {
    name: name.trim() ? null : 'Giv posten et navn',
    amount: ore && ore > 0 ? null : 'Skriv beløbet',
    group: kind === 'income' || groupId ? null : 'Vælg en gruppe',
  }
  const valid = !errors.name && !errors.amount && !errors.group

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    try {
      const id = await create.mutateAsync({
        kind,
        name,
        amountOre: negative ? -ore! : ore!,
        frequency,
        dueMonth,
        groupId,
        owner: kind === 'income' ? decodePaidBy(owner) : null,
        paymentDay: paymentDay ? Number(paymentDay) : null,
        note,
        startMonth,
      })
      navigate(`/okonomi/faste/${id}`, { replace: true })
    } catch {
      // vises nedenfor
    }
  }

  const monthly = ore ? (frequency === 'quarterly' ? Math.round(ore / 3) : frequency === 'yearly' ? Math.round(ore / 12) : ore) : 0

  return (
    <>
      <PageHeader title={kind === 'income' ? 'Ny fast indtægt' : 'Ny fast udgift'} back />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div>
          <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" autoFocus />
          {touched && errors.amount && <p className="mt-1 px-1 text-center text-[13px] text-danger">{errors.amount}</p>}
          {frequency !== 'monthly' && monthly > 0 && (
            <p className="tabular mt-1.5 text-center text-[13px] text-secondary">≈ {formatAmount(monthly, { decimals: 'always' })} kr. pr. måned i gennemsnit</p>
          )}
        </div>

        {kind === 'expense' && (
          <div>
            <SegmentedControl
              label="Udgift eller modregning"
              options={[
                { value: 'plus', label: 'Udgift' },
                { value: 'minus', label: 'Modregning (−)' },
              ]}
              value={negative ? 'minus' : 'plus'}
              onChange={(v) => setNegative(v === 'minus')}
            />
            {negative && <p className="mt-1.5 px-1 text-[12px] text-secondary">Fx tilskud eller refusion, der trækker de faste udgifter ned.</p>}
          </div>
        )}

        <Field label="Navn" error={touched ? errors.name : null}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={kind === 'income' ? 'Fx Min løn' : 'Fx Husleje'} autoCapitalize="sentences" />
        </Field>

        {kind === 'income' ? (
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvis indkomst</p>
            <SegmentedControl label="Hvis indkomst" options={paidByOptions(members)} value={owner} onChange={setOwner} />
          </div>
        ) : (
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gruppe</p>
            <div role="radiogroup" aria-label="Gruppe" className="flex flex-wrap gap-2">
              {activeGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    'pressable rounded-full px-4 py-2.5 text-[14px] font-semibold',
                    groupId === g.id ? 'bg-surface-inverse text-on-inverse' : 'bg-surface-primary text-primary shadow-card',
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
            {touched && errors.group && <p className="mt-1 px-1 text-[13px] text-danger">{errors.group}</p>}
          </div>
        )}

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvor ofte</p>
          <FrequencyPicker
            frequency={frequency}
            dueMonth={dueMonth}
            onChange={(f, d) => {
              setFrequency(f)
              setDueMonth(d)
            }}
          />
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gælder fra</p>
          <MonthStepper month={startMonth} onChange={setStartMonth} min={monthKey(new Date())} />
        </div>

        <label className="block">
          <span className="mb-1.5 block px-1 text-[13px] font-semibold text-secondary">Betalingsdag (valgfri)</span>
          <select className={selectCls} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)}>
            <option value="">Ikke angivet</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Den {i + 1}.
              </option>
            ))}
          </select>
        </label>

        <Field label="Note (valgfri)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
        </Field>

        {create.isError && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
            {fixedErrorMessage(create.error)}
          </p>
        )}
        <Button type="submit" block loading={create.isPending}>
          Gem
        </Button>
      </form>
    </>
  )
}
