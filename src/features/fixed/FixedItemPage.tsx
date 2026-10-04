import { Archive, ArchiveRestore, Landmark, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, TextArea, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { MonthStepper } from '@/components/ui/MonthStepper'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { decodePaidBy, encodePaidBy, paidByLabel, paidByOptions } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatMonthYear, fromIsoDate, monthKey } from '@/lib/dates'
import { formatAmount, parseKr, toInputValue } from '@/lib/money'
import type { Frequency } from '@/types/database'
import {
  fixedErrorMessage,
  frequencyLabel,
  useDeleteFixedItem,
  useFixedGroups,
  useFixedItems,
  useFixedVersions,
  useSetFixedAmount,
  useUpdateFixedItem,
  type FixedItem,
  type FixedVersion,
} from './api'
import { FrequencyPicker, monthName, selectCls } from './FrequencyPicker'

type Sheet = 'amount' | 'edit' | 'stop' | 'delete' | null

const addMonths = (m: string, n: number) => {
  const d = fromIsoDate(m)
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1, 12))
}

export function FixedItemPage() {
  const { id } = useParams()
  const items = useFixedItems()
  const item = items.data?.find((i) => i.id === id)
  if (items.isPending) return <FullScreenLoader />
  if (!item)
    return (
      <>
        <PageHeader title="Fast post" back="/okonomi/faste" />
        <EmptyState icon={Landmark} title="Posten findes ikke" />
      </>
    )
  return <FixedItemDetail item={item} />
}

function FixedItemDetail({ item }: { item: FixedItem }) {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const groups = useFixedGroups()
  const versions = useFixedVersions(item.id)
  const update = useUpdateFixedItem()
  const [sheet, setSheet] = useState<Sheet>(null)

  const current = monthKey(new Date())
  const list = versions.data ?? []
  const currentVersion = list.find((v) => v.valid_from <= current) ?? list.at(-1)
  const group = groups.data?.find((g) => g.id === item.group_id)
  const ended = item.end_month !== null && item.end_month < current
  const canDelete = item.start_month >= current
  const monthly = (v: FixedVersion) => (v.frequency === 'quarterly' ? Math.round(v.amount_ore / 3) : v.frequency === 'yearly' ? Math.round(v.amount_ore / 12) : v.amount_ore)

  return (
    <>
      <PageHeader
        title={item.name}
        eyebrow={item.kind === 'income' ? 'Fast indtægt' : `Fast udgift${group ? ` · ${group.name}` : ''}`}
        back="/okonomi/faste"
        action={
          <button type="button" aria-label="Redigér" onClick={() => setSheet('edit')} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
            <Pencil className="size-4.5" />
          </button>
        }
      />

      {currentVersion && (
        <Card className="p-5">
          <p className="text-[13px] font-medium text-secondary">
            {frequencyLabel[currentVersion.frequency]}
            {currentVersion.frequency !== 'monthly' && ` · betales i ${monthName(currentVersion.due_month)}`}
          </p>
          <Money ore={currentVersion.amount_ore} size="xl" decimals="always" className={currentVersion.amount_ore < 0 ? 'text-positive' : undefined} />
          {currentVersion.frequency !== 'monthly' && (
            <p className="tabular mt-1 text-[14px] text-secondary">≈ {formatAmount(Math.abs(monthly(currentVersion)), { decimals: 'always' })} kr. pr. måned i gennemsnit</p>
          )}
          {currentVersion.amount_ore < 0 && <p className="mt-1 text-[13px] text-secondary">Modregning – trækker de faste udgifter ned.</p>}
          <dl className="mt-4 divide-y divide-subtle text-[15px]">
            {item.kind === 'income' && (
              <div className="flex justify-between py-2.5">
                <dt className="text-secondary">Hvis indkomst</dt>
                <dd className="font-medium">{paidByLabel(item.owner_kind ?? 'shared', item.owner_user_id, members)}</dd>
              </div>
            )}
            {item.payment_day && (
              <div className="flex justify-between py-2.5">
                <dt className="text-secondary">Betalingsdag</dt>
                <dd className="font-medium">Den {item.payment_day}.</dd>
              </div>
            )}
            <div className="flex justify-between py-2.5">
              <dt className="text-secondary">Periode</dt>
              <dd className="text-right font-medium">
                Fra {formatMonthYear(fromIsoDate(item.start_month))}
                {item.end_month ? ` til og med ${formatMonthYear(fromIsoDate(item.end_month))}` : ' · løbende'}
              </dd>
            </div>
          </dl>
          {item.note && <p className="mt-3 rounded-2xl bg-surface-secondary px-4 py-3 text-[14px]">{item.note}</p>}
          {!ended && !item.archived_at && (
            <Button block className="mt-4" onClick={() => setSheet('amount')}>
              Ændr beløb
            </Button>
          )}
        </Card>
      )}

      <SectionHeader title="Beløb over tid" />
      <Card padded={false} className="divide-y divide-subtle">
        {list.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[15px]">
                Fra <span className="font-semibold">{formatMonthYear(fromIsoDate(v.valid_from))}</span>
                {v.valid_from > current && <span className="ml-2 rounded-full bg-surface-accent px-2 py-0.5 text-[11px] font-semibold text-accent-text">Planlagt</span>}
              </p>
              <p className="text-[12px] text-secondary">{frequencyLabel[v.frequency]}</p>
            </div>
            <Money ore={v.amount_ore} size="md" decimals="always" />
          </div>
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12px] text-secondary">Tidligere måneder beholder det beløb, der gjaldt dengang.</p>

      <ListGroup className="mt-8">
        {item.end_month && !item.archived_at ? (
          item.end_month >= addMonths(current, -1) ? (
            <ListRow icon={Play} title="Genoptag" subtitle="Posten fortsætter løbende" onClick={() => update.mutate({ id: item.id, end_month: null })} />
          ) : null
        ) : !item.archived_at ? (
          <ListRow icon={Pause} iconColor="var(--notice)" title="Stop posten" subtitle="Fx ved opsagt abonnement" onClick={() => setSheet('stop')} />
        ) : null}
        {canDelete ? (
          <ListRow icon={Trash2} iconColor="var(--danger)" tone="danger" title="Slet" onClick={() => setSheet('delete')} />
        ) : item.archived_at ? (
          <ListRow icon={ArchiveRestore} title="Vis igen" onClick={() => update.mutate({ id: item.id, archived_at: null })} />
        ) : ended ? (
          <ListRow
            icon={Archive}
            title="Arkivér"
            subtitle="Skjul fra listen – historikken bevares"
            onClick={() => update.mutate({ id: item.id, archived_at: new Date().toISOString() }, { onSuccess: () => navigate('/okonomi/faste') })}
          />
        ) : null}
      </ListGroup>
      {update.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(update.error)}</p>}

      <BottomSheet open={sheet === 'amount'} onClose={() => setSheet(null)} title="Ændr beløb">
        {sheet === 'amount' && currentVersion && <AmountForm item={item} current={currentVersion} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Redigér">
        {sheet === 'edit' && <EditForm item={item} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'stop'} onClose={() => setSheet(null)} title="Stop posten">
        {sheet === 'stop' && <StopForm item={item} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Slet fast post?">
        {sheet === 'delete' && <DeleteForm item={item} onDone={() => navigate('/okonomi/faste', { replace: true })} onCancel={() => setSheet(null)} />}
      </BottomSheet>
    </>
  )
}

function AmountForm({ item, current, onDone }: { item: FixedItem; current: FixedVersion; onDone: () => void }) {
  const set = useSetFixedAmount()
  const min = monthKey(new Date())
  const [amount, setAmount] = useState(toInputValue(current.amount_ore))
  const [negative, setNegative] = useState(current.amount_ore < 0)
  const [frequency, setFrequency] = useState<Frequency>(current.frequency)
  const [dueMonth, setDueMonth] = useState<number | null>(current.due_month)
  const [from, setFrom] = useState(item.start_month > min ? item.start_month : min)
  const ore = parseKr(amount)
  return (
    <>
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Nyt beløb i kroner" />
      {item.kind === 'expense' && (
        <div className="mt-3">
          <SegmentedControl
            label="Udgift eller modregning"
            options={[
              { value: 'plus', label: 'Udgift' },
              { value: 'minus', label: 'Modregning (−)' },
            ]}
            value={negative ? 'minus' : 'plus'}
            onChange={(v) => setNegative(v === 'minus')}
          />
        </div>
      )}
      <div className="mt-4">
        <FrequencyPicker
          frequency={frequency}
          dueMonth={dueMonth}
          onChange={(f, d) => {
            setFrequency(f)
            setDueMonth(d)
          }}
        />
      </div>
      <p className="mb-1.5 mt-5 px-1 text-[13px] font-semibold text-secondary">Gælder fra</p>
      <MonthStepper month={from} onChange={setFrom} min={min > item.start_month ? min : item.start_month} />
      <p className="mt-3 px-1 text-[13px] text-secondary">Måneder før {formatMonthYear(fromIsoDate(from))} beholder det nuværende beløb.</p>
      {set.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(set.error)}</p>}
      <Button
        block
        className="mt-5"
        disabled={!ore || ore <= 0}
        loading={set.isPending}
        onClick={() => set.mutate({ itemId: item.id, validFrom: from, amountOre: negative ? -ore! : ore!, frequency, dueMonth }, { onSuccess: onDone })}
      >
        Gem nyt beløb
      </Button>
    </>
  )
}

function EditForm({ item, onDone }: { item: FixedItem; onDone: () => void }) {
  const update = useUpdateFixedItem()
  const groups = useFixedGroups()
  const { members } = useHousehold()
  const [name, setName] = useState(item.name)
  const [groupId, setGroupId] = useState(item.group_id)
  const [owner, setOwner] = useState(encodePaidBy(item.owner_kind ?? 'shared', item.owner_user_id))
  const [paymentDay, setPaymentDay] = useState(item.payment_day ? String(item.payment_day) : '')
  const [note, setNote] = useState(item.note ?? '')
  const o = decodePaidBy(owner)
  return (
    <div className="space-y-5">
      <Field label="Navn">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      {item.kind === 'income' ? (
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvis indkomst</p>
          <SegmentedControl label="Hvis indkomst" options={paidByOptions(members)} value={owner} onChange={setOwner} />
        </div>
      ) : (
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gruppe</p>
          <div className="flex flex-wrap gap-2">
            {(groups.data ?? [])
              .filter((g) => !g.archived_at || g.id === item.group_id)
              .map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                  className={cn('pressable rounded-full px-4 py-2.5 text-[14px] font-semibold', groupId === g.id ? 'bg-surface-inverse text-on-inverse' : 'bg-surface-primary text-primary shadow-card')}
                >
                  {g.name}
                </button>
              ))}
          </div>
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block px-1 text-[13px] font-semibold text-secondary">Betalingsdag</span>
        <select className={selectCls} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)}>
          <option value="">Ikke angivet</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Den {i + 1}.
            </option>
          ))}
        </select>
      </label>
      <Field label="Note">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
      </Field>
      <p className="px-1 text-[12px] text-secondary">Beløbet ændres med "Ændr beløb", så historikken bevares.</p>
      {update.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(update.error)}</p>}
      <Button
        block
        disabled={!name.trim()}
        loading={update.isPending}
        onClick={() =>
          update.mutate(
            {
              id: item.id,
              name: name.trim(),
              note: note.trim() || null,
              payment_day: paymentDay ? Number(paymentDay) : null,
              ...(item.kind === 'income' ? { owner_kind: o.kind, owner_user_id: o.userId } : { group_id: groupId }),
            },
            { onSuccess: onDone },
          )
        }
      >
        Gem
      </Button>
    </div>
  )
}

function StopForm({ item, onDone }: { item: FixedItem; onDone: () => void }) {
  const update = useUpdateFixedItem()
  const current = monthKey(new Date())
  const min = item.start_month > addMonths(current, -1) ? item.start_month : addMonths(current, -1)
  const [last, setLast] = useState(current >= item.start_month ? current : item.start_month)
  return (
    <>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Sidste måned med posten</p>
      <MonthStepper month={last} onChange={setLast} min={min} />
      <p className="mt-3 px-1 text-[13px] text-secondary">
        Posten tæller med til og med {formatMonthYear(fromIsoDate(last))} og stopper derefter. Tidligere måneder ændres ikke.
      </p>
      {update.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(update.error)}</p>}
      <Button block className="mt-5" loading={update.isPending} onClick={() => update.mutate({ id: item.id, end_month: last }, { onSuccess: onDone })}>
        Stop efter {formatMonthYear(fromIsoDate(last))}
      </Button>
    </>
  )
}

function DeleteForm({ item, onDone, onCancel }: { item: FixedItem; onDone: () => void; onCancel: () => void }) {
  const del = useDeleteFixedItem()
  return (
    <>
      <p className="text-[15px] text-secondary">"{item.name}" har ingen historik endnu og kan slettes helt.</p>
      {del.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(del.error)}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Annullér
        </Button>
        <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(item.id, { onSuccess: onDone })}>
          Slet
        </Button>
      </div>
    </>
  )
}
