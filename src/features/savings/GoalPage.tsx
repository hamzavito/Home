import { Archive, ArchiveRestore, ArrowDownLeft, ArrowUpRight, Pencil, PiggyBank, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput, Field, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { today } from '@/features/finance/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatMonthYear, relativeDay } from '@/lib/dates'
import { formatAmount, parseKr } from '@/lib/money'
import { averageMonthly, projectGoal, requiredMonthly } from '@/lib/savings'
import type { MovementKind } from '@/types/database'
import { savingsErrorMessage, useAddMovement, useDeleteMovement, useGoals, useMovements, useSaveGoal, type GoalMovement, type GoalWithProgress } from './api'
import { GoalForm } from './GoalForm'

export function GoalPage() {
  const { id } = useParams()
  const goals = useGoals()
  const goal = goals.data?.find((g) => g.id === id)
  if (goals.isPending) return <FullScreenLoader />
  if (!goal)
    return (
      <>
        <PageHeader title="Opsparing" back="/opsparing" />
        <EmptyState icon={PiggyBank} title="Målet findes ikke" />
      </>
    )
  return <Goal goal={goal} />
}

function Goal({ goal }: { goal: GoalWithProgress }) {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const movements = useMovements(goal.id)
  const save = useSaveGoal()
  const [sheet, setSheet] = useState<MovementKind | 'edit' | null>(null)
  const [toDelete, setToDelete] = useState<GoalMovement | null>(null)
  const del = useDeleteMovement()

  const pct = Math.min(100, Math.round((goal.currentOre / goal.target_ore) * 100))
  const monthly = averageMonthly(movements.data ?? [])
  const projection = projectGoal(goal.currentOre, goal.target_ore, monthly)
  const required = goal.target_date ? requiredMonthly(goal.currentOre, goal.target_ore, goal.target_date) : null
  const who = (id: string) => members.find((m) => m.userId === id)

  return (
    <>
      <PageHeader
        title={goal.name}
        eyebrow={goal.archived_at ? 'Arkiveret mål' : 'Opsparingsmål'}
        back="/opsparing"
        action={
          <button type="button" aria-label="Redigér mål" onClick={() => setSheet('edit')} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
            <Pencil className="size-4.5" />
          </button>
        }
      />

      <Card className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-secondary">Sparet op</p>
            <Money ore={goal.currentOre} size="xl" decimals="never" />
          </div>
          <span className="tabular rounded-full bg-positive-soft px-2.5 py-1 text-[14px] font-bold text-positive">{pct} %</span>
        </div>
        <ProgressBar value={goal.currentOre} max={goal.target_ore} tone="positive" size="lg" className="mt-4" label={`${pct} % af målet`} />
        <div className="mt-4 grid grid-cols-2 gap-3 text-[14px]">
          <div>
            <p className="text-secondary">Mål</p>
            <p className="tabular font-semibold">{formatAmount(goal.target_ore, { decimals: 'never' })} kr.</p>
          </div>
          <div>
            <p className="text-secondary">Mangler</p>
            <p className="tabular font-semibold">{formatAmount(Math.max(goal.target_ore - goal.currentOre, 0), { decimals: 'never' })} kr.</p>
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-surface-secondary px-4 py-3 text-[14px]">
          {projection.kind === 'reached'
            ? 'Målet er nået. Godt gået!'
            : projection.kind === 'eta'
              ? `Med jeres tempo (${formatAmount(monthly, { decimals: 'never' })} kr./md.) når I målet omkring ${formatMonthYear(projection.date)}.`
              : 'Indbetal regelmæssigt, så viser vi hvornår målet nås.'}
          {required !== null && required > 0 && goal.target_date && (
            <span className="mt-1 block text-secondary">
              For at nå det til {formatMonthYear(new Date(`${goal.target_date}T12:00:00`))} skal I spare {formatAmount(required, { decimals: 'never' })} kr./md.
            </span>
          )}
        </p>
        {!goal.archived_at && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button onClick={() => setSheet('deposit')}>
              <ArrowDownLeft className="size-4.5" /> Indbetal
            </Button>
            <Button variant="secondary" onClick={() => setSheet('withdrawal')} disabled={goal.currentOre <= 0}>
              <ArrowUpRight className="size-4.5" /> Hæv
            </Button>
          </div>
        )}
      </Card>

      {goal.note && <p className="mt-3 rounded-card bg-surface-secondary px-4 py-3 text-[14px]">{goal.note}</p>}

      <SectionHeader title="Bevægelser" />
      {(movements.data ?? []).length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={PiggyBank} title="Ingen bevægelser endnu" text="Registrér en indbetaling, når I flytter penge til opsparingen." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {movements.data!.map((m) => {
            const p = who(m.created_by)
            return (
              <button key={m.id} type="button" onClick={() => setToDelete(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-secondary">
                <Avatar name={p?.displayName ?? '?'} color={p?.color} index={members.findIndex((x) => x.userId === m.created_by)} className="size-8 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{m.kind === 'deposit' ? 'Indbetaling' : 'Hævning'}</p>
                  <p className="truncate text-[13px] text-secondary">
                    {relativeDay(m.occurred_on)}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                <span className={`tabular text-[16px] font-semibold ${m.kind === 'deposit' ? 'text-positive' : ''}`}>
                  {m.kind === 'deposit' ? '+' : '−'}
                  {formatAmount(m.amount_ore)} kr.
                </span>
              </button>
            )
          })}
        </Card>
      )}

      <ListGroup className="mt-8">
        {goal.archived_at ? (
          <ListRow icon={ArchiveRestore} title="Gør aktivt igen" onClick={() => save.mutate({ id: goal.id, archived_at: null })} />
        ) : (
          <ListRow icon={Archive} title="Arkivér mål" subtitle="Saldo og bevægelser bevares" onClick={() => save.mutate({ id: goal.id, archived_at: new Date().toISOString() }, { onSuccess: () => navigate('/opsparing') })} />
        )}
      </ListGroup>

      <BottomSheet open={sheet === 'deposit' || sheet === 'withdrawal'} onClose={() => setSheet(null)} title={sheet === 'withdrawal' ? 'Hæv fra opsparing' : 'Indbetal til opsparing'}>
        {(sheet === 'deposit' || sheet === 'withdrawal') && <MovementForm goal={goal} kind={sheet} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Redigér mål">
        {sheet === 'edit' && <GoalForm goal={goal} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={toDelete !== null} onClose={() => setToDelete(null)} title="Slet bevægelse?">
        {toDelete && (
          <>
            <p className="text-[15px] text-secondary">
              {toDelete.kind === 'deposit' ? 'Indbetalingen' : 'Hævningen'} på {formatAmount(toDelete.amount_ore)} kr. fjernes, og saldoen opdateres.
            </p>
            {del.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{savingsErrorMessage(del.error)}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setToDelete(null)}>
                Annullér
              </Button>
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}>
                <Trash2 className="size-4" /> Slet
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </>
  )
}

function MovementForm({ goal, kind, onDone }: { goal: GoalWithProgress; kind: MovementKind; onDone: () => void }) {
  const add = useAddMovement()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const ore = parseKr(amount)
  const tooMuch = kind === 'withdrawal' && ore !== null && ore > goal.currentOre
  return (
    <div className="space-y-4">
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb i kroner" autoFocus />
      {tooMuch && <p className="text-center text-[13px] font-medium text-danger">Der er kun {formatAmount(goal.currentOre)} kr. på målet.</p>}
      <Field label="Dato">
        <TextInput type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label="Note (valgfri)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={kind === 'deposit' ? 'Fx fra lønnen' : 'Fx flybilletter'} />
      </Field>
      {add.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{savingsErrorMessage(add.error)}</p>}
      <Button block disabled={!ore || ore <= 0 || tooMuch} loading={add.isPending} onClick={() => add.mutate({ goalId: goal.id, kind, amountOre: ore!, occurredOn: date, note }, { onSuccess: onDone })}>
        {kind === 'deposit' ? 'Indbetal' : 'Hæv'}
      </Button>
    </div>
  )
}
