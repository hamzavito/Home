import { Banknote, Check, ChevronRight, Landmark, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, SelectInput, TextInput } from '@/components/ui/Field'
import { ListGroup } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Spinner'
import { decodePaidBy, defaultPaidBy, encodePaidBy, paidByOptions } from '@/features/finance/paidBy'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'
import { cn } from '@/lib/cn'
import { formatMonthYear, formatShortDate, fromIsoDate, monthKey, toIsoDate } from '@/lib/dates'
import { formatAmount, parseKr, toInputValue } from '@/lib/money'
import {
  useConfirmIncomeSource,
  useCreateIncomeSource,
  useCreateIncomeType,
  useDeleteIncome,
  useIncomeSources,
  useIncomeTypes,
  useMonthIncome,
  useMonthIncomeBySource,
  useSaveIncome,
  useUpdateIncomeSource,
  type IncomeEntry,
  type IncomeSource,
} from './api'

const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  return toIsoDate(new Date(y!, mo! - 1 + n, 1, 12))
}

const saveError = (e: unknown) => (isReadOnlyError(e) ? READ_ONLY_MESSAGE : 'Det kunne ikke gemmes. Prøv igen.')

/**
 * Indtægter: kilderne ("Løn – Hamza") og de faktiske beløb pr. måned.
 * Kommer en indtægt fra banken, foreslår appen kilden – brugeren bekræfter eller retter.
 */
export function IncomePage() {
  const [month, setMonth] = useMonthParam()
  const entries = useMonthIncome(month)
  const bySource = useMonthIncomeBySource(month)
  const sources = useIncomeSources()
  const confirm = useConfirmIncomeSource()
  const [edit, setEdit] = useState<IncomeEntry | 'new' | null>(null)
  const [sourceSheet, setSourceSheet] = useState<IncomeSource | 'new' | null>(null)
  const list = entries.data ?? []
  const rows = bySource.data ?? []
  const actual = list.reduce((s, x) => s + x.amount_ore, 0)
  const expected = rows.filter((r) => r.status === 'expected').reduce((s, r) => s + r.used_ore, 0)
  const sourceName = new Map((sources.data ?? []).map((s) => [s.id, s.name]))
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-secondary">Indtægter i {formatMonthYear(fromIsoDate(month))}</p>
            <Money ore={actual} size="lg" className="text-positive" />
            {expected > 0 && <p className="mt-1 text-[13px] text-secondary">+ {formatAmount(expected, { decimals: 'auto' })} kr. forventet, ikke modtaget endnu</p>}
          </div>
          <Button size="sm" onClick={() => setEdit('new')}>
            <Plus className="size-4" strokeWidth={2.6} /> Indtægt
          </Button>
        </div>
        <Link to={`/okonomi/plan${q}`} className="mt-3 flex items-center gap-1 text-[14px] font-semibold text-accent-text">
          Se månedens plan <ChevronRight className="size-4" />
        </Link>
      </Card>

      <SectionHeader title="Indtægtskilder" action={<Button size="sm" variant="ghost" onClick={() => setSourceSheet('new')}><Plus className="size-4" /> Ny kilde</Button>} />
      {bySource.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Sparkles} title="Ingen indtægtskilder endnu" text="Fx “Løn – Hamza”. Beløbet må gerne variere fra måned til måned." />
        </Card>
      ) : (
        <ListGroup>
          {rows.map((r) => {
            const src = (sources.data ?? []).find((s) => s.id === r.source_id)
            const body = (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16px] font-medium">{r.name}</span>
                  <span className="truncate text-[13px] text-secondary">
                    {r.type_name ?? 'Indtægt'}
                    {r.status === 'expected' ? ' · Forventet – ikke modtaget' : r.entry_count > 1 ? ` · ${r.entry_count} indtægter` : ''}
                    {r.unconfirmed_count > 0 && ' · Forslag venter'}
                  </span>
                </span>
                <span className={cn('tabular shrink-0 text-[16px] font-semibold', r.status === 'expected' ? 'text-secondary' : 'text-positive')}>
                  {formatAmount(r.used_ore, { decimals: 'always' })} kr.
                </span>
              </>
            )
            return src ? (
              <button key={r.source_id} type="button" onClick={() => setSourceSheet(src)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-secondary">
                {body}
              </button>
            ) : (
              <div key="none" className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                {body}
              </div>
            )
          })}
        </ListGroup>
      )}

      <SectionHeader title="Indtægter" />
      {entries.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : list.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Banknote} title="Ingen indtægter denne måned" text="Forbind din bank, så kommer løn og andre indtægter automatisk – eller tilføj dem selv." />
        </Card>
      ) : (
        <ListGroup>
          {list.map((x) => {
            const suggestion = x.source_id !== null && !x.matched_by_user
            return (
              <div key={x.id} className="flex min-h-[60px] items-center gap-2 pr-2">
                <button type="button" onClick={() => setEdit(x)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:opacity-60">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-medium">{x.description}</span>
                    <span className="truncate text-[13px] text-secondary">
                      {formatShortDate(fromIsoDate(x.received_on))} · {x.source_id ? sourceName.get(x.source_id) : 'Ingen kilde'}
                      {suggestion && <span className="font-semibold text-notice"> · Forslag</span>}
                    </span>
                  </span>
                  {x.source === 'bank' && <Landmark className="size-4 shrink-0 text-muted" aria-label="Fra banken" />}
                  <Money ore={x.amount_ore} sign="income" className="text-positive" decimals="always" />
                </button>
                {suggestion && (
                  <button
                    type="button"
                    aria-label={`Bekræft ${sourceName.get(x.source_id!)} for ${x.description}`}
                    onClick={() => confirm.mutate(x.id)}
                    className="pressable flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                  >
                    <Check className="size-4.5" strokeWidth={2.6} />
                  </button>
                )}
              </div>
            )
          })}
        </ListGroup>
      )}
      {list.some((x) => x.source === 'bank') && (
        <p className="mt-2 px-1 text-[13px] text-secondary">Kommer indtægten fra banken, foreslår appen kilden ud fra afsenderen og tidligere valg. Bekræft med ✓, eller tryk og ret.</p>
      )}

      <BottomSheet open={edit !== null} onClose={() => setEdit(null)} title={edit === 'new' ? 'Ny indtægt' : 'Indtægt'}>
        {edit && <IncomeForm key={edit === 'new' ? 'new' : edit.id} existing={edit === 'new' ? null : edit} month={month} onDone={() => setEdit(null)} />}
      </BottomSheet>
      <BottomSheet open={sourceSheet !== null} onClose={() => setSourceSheet(null)} title={sourceSheet === 'new' ? 'Ny indtægtskilde' : 'Indtægtskilde'}>
        {sourceSheet && <SourceForm key={sourceSheet === 'new' ? 'new' : sourceSheet.id} existing={sourceSheet === 'new' ? null : sourceSheet} onDone={() => setSourceSheet(null)} />}
      </BottomSheet>
    </>
  )
}

/** Typevælger: Løn, Børnepenge … + egen type */
function TypePicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const types = useIncomeTypes()
  const create = useCreateIncomeType()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  return (
    <div>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Type</p>
      <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
        {(types.data ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            onClick={() => onChange(t.id)}
            className={cn('pressable h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors', value === t.id ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
          >
            {t.name}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="pressable h-9 rounded-full border border-dashed border-strong px-3.5 text-[14px] font-semibold text-secondary">
            + Egen type
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2">
          <TextInput value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Fx Fødevarekort" aria-label="Ny type" autoFocus />
          <Button
            type="button"
            size="sm"
            disabled={!name.trim()}
            loading={create.isPending}
            onClick={() =>
              create.mutate(name, {
                onSuccess: (id) => {
                  onChange(id)
                  setAdding(false)
                  setName('')
                },
              })
            }
          >
            Tilføj
          </Button>
        </div>
      )}
      {create.isError && <p className="mt-1 px-1 text-[13px] text-danger">Typen kunne ikke oprettes (findes den allerede?).</p>}
    </div>
  )
}

function IncomeForm({ existing, month, onDone }: { existing: IncomeEntry | null; month: string; onDone: () => void }) {
  const { adults, me } = useHousehold()
  const sources = useIncomeSources()
  const save = useSaveIncome()
  const del = useDeleteIncome()
  const today = toIsoDate(new Date())
  const defaultDate = existing?.received_on ?? (month === monthKey(new Date()) ? today : month)
  const [amount, setAmount] = useState(existing ? toInputValue(existing.amount_ore) : '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [date, setDate] = useState(defaultDate)
  const [period, setPeriod] = useState(existing?.period_month ?? `${defaultDate.slice(0, 7)}-01`)
  const [who, setWho] = useState(existing ? encodePaidBy(existing.received_by_kind, existing.received_by_user_id) : defaultPaidBy(me))
  const [sourceId, setSourceId] = useState<string | null>(existing?.source_id ?? null)
  const [typeId, setTypeId] = useState<string | null>(existing?.type_id ?? null)
  const active = (sources.data ?? []).filter((s) => !s.archived_at || s.id === sourceId)
  const ore = parseKr(amount)
  const valid = ore !== null && ore > 0 && (description.trim().length > 0 || sourceId !== null)
  const error = save.error ?? del.error
  const dateMonth = `${date.slice(0, 7)}-01`
  const periodOptions = [addMonths(dateMonth, -1), dateMonth, addMonths(dateMonth, 1)]
  const suggestion = existing && existing.source_id && !existing.matched_by_user

  function pickSource(id: string | null) {
    setSourceId(id)
    const s = (sources.data ?? []).find((x) => x.id === id)
    if (s) {
      setTypeId(s.type_id)
      if (!description.trim() || (sources.data ?? []).some((x) => x.name === description)) setDescription(s.name)
      if (!existing) setWho(encodePaidBy(s.owner_kind, s.owner_user_id))
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const desc = description.trim() || (sources.data ?? []).find((x) => x.id === sourceId)?.name || 'Indtægt'
        save.mutate({ id: existing?.id, amountOre: ore!, receivedOn: date, description: desc, paidBy: decodePaidBy(who), sourceId, typeId, periodMonth: period }, { onSuccess: onDone })
      }}
      className="space-y-4"
    >
      {suggestion && (
        <p className="rounded-2xl bg-notice-soft px-4 py-3 text-[14px] font-medium text-notice">
          Appen foreslår kilden ud fra afsenderen{existing.match_confidence !== null ? ` (sikkerhed ${existing.match_confidence} %)` : ''}. Ret den, hvis den er forkert.
        </p>
      )}
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" />
      <Field label="Indtægtskilde" hint="Samme kilde hver måned, selv om beløbet varierer.">
        <SelectInput value={sourceId ?? ''} onChange={(e) => pickSource(e.target.value || null)} aria-label="Indtægtskilde">
          <option value="">Ingen kilde (enkeltstående)</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <TypePicker value={typeId} onChange={setTypeId} />
      <Field label="Beskrivelse">
        <TextInput value={description} maxLength={80} onChange={(e) => setDescription(e.target.value)} placeholder="Fx Løn oktober" />
      </Field>
      <Field label="Dato">
        <TextInput
          type="date"
          value={date}
          onChange={(e) => {
            if (!e.target.value) return
            setDate(e.target.value)
            setPeriod(`${e.target.value.slice(0, 7)}-01`)
          }}
        />
      </Field>
      <Field label="Hører til måned" hint="Fx løn for oktober, der først kommer den 1. november.">
        <SelectInput value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Hører til måned">
          {periodOptions.map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(fromIsoDate(m))}
            </option>
          ))}
        </SelectInput>
      </Field>
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvis indtægt</p>
        <SegmentedControl label="Hvis indtægt" options={paidByOptions(adults)} value={who} onChange={setWho} />
      </div>
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{saveError(error)}</p>}
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

function SourceForm({ existing, onDone }: { existing: IncomeSource | null; onDone: () => void }) {
  const { adults, me } = useHousehold()
  const create = useCreateIncomeSource()
  const update = useUpdateIncomeSource()
  const [name, setName] = useState(existing?.name ?? '')
  const [typeId, setTypeId] = useState<string | null>(existing?.type_id ?? null)
  const [who, setWho] = useState(existing ? encodePaidBy(existing.owner_kind, existing.owner_user_id) : defaultPaidBy(me))
  const [expected, setExpected] = useState('')
  const expectedOre = expected.trim() ? parseKr(expected) : null
  const valid = name.trim().length > 0 && (expected.trim() === '' || (expectedOre !== null && expectedOre > 0))
  const error = create.error ?? update.error
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        if (existing) update.mutate({ id: existing.id, name, ...(typeId ? { typeId } : {}) }, { onSuccess: onDone })
        else create.mutate({ name, typeId, owner: decodePaidBy(who), expectedOre }, { onSuccess: onDone })
      }}
    >
      <Field label="Navn">
        <TextInput value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Fx Løn – Hamza" autoFocus={!existing} />
      </Field>
      <TypePicker value={typeId} onChange={setTypeId} />
      {!existing && (
        <>
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvis indtægt</p>
            <SegmentedControl label="Hvis indtægt" options={paidByOptions(adults)} value={who} onChange={setWho} />
          </div>
          <Field label="Forventet beløb pr. måned (valgfrit)" hint="Bruges i planen, indtil den faktiske indtægt er kommet. Kan ændres under Faste poster.">
            <TextInput inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Fx 29.000" />
          </Field>
        </>
      )}
      {existing && (
        <p className="px-1 text-[13px] text-secondary">
          {existing.fixed_item_id ? 'Det forventede beløb styres under Faste poster.' : 'Ingen forventet beløb – kun faktiske indtægter tæller.'} Gamle måneder ændres ikke, når du omdøber.
        </p>
      )}
      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{saveError(error)}</p>}
      <Button type="submit" block disabled={!valid} loading={create.isPending || update.isPending}>
        {existing ? 'Gem' : 'Opret kilde'}
      </Button>
      {existing && (
        <Button type="button" variant="secondary" block loading={update.isPending} onClick={() => update.mutate({ id: existing.id, archived: !existing.archived_at }, { onSuccess: onDone })}>
          {existing.archived_at ? 'Brug kilden igen' : 'Arkivér kilden'}
        </Button>
      )}
    </form>
  )
}
