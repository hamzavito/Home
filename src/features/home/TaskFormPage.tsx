import { CheckSquare, Minus, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useGoBack } from '@/app/useGoBack'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, TextArea, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatLongDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { nextDue, recurrenceLabel } from '@/lib/home'
import type { Recurrence, TaskPriority, TaskStatus } from '@/types/database'
import { homeErrorMessage, useDeleteTask, useSaveTask, useSetTaskStatus, useTask, type Task } from './api'
import { priorityLabels, statusLabels } from './meta'

export function TaskFormPage() {
  const { id } = useParams()
  const task = useTask(id)
  if (id && task.isPending) return <FullScreenLoader />
  const existing = task.data ?? undefined
  if (id && !existing)
    return (
      <>
        <PageHeader title="Opgave" back="/hjemmet" />
        <EmptyState icon={CheckSquare} title="Opgaven findes ikke" text="Den kan være slettet på den anden telefon." />
      </>
    )
  return <TaskForm key={id ?? 'new'} existing={existing} />
}

const unitLabel: Record<Exclude<Recurrence, 'none'>, [string, string]> = { daily: ['dag', 'dage'], weekly: ['uge', 'uger'], monthly: ['måned', 'måneder'] }

function TaskForm({ existing }: { existing?: Task }) {
  const goBack = useGoBack()
  const { members } = useHousehold()
  const save = useSaveTask()
  const del = useDeleteTask()
  const setStatus = useSetTaskStatus()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [assignee, setAssignee] = useState(existing?.assignee_id ?? 'none')
  const [due, setDue] = useState(existing?.due_on ?? '')
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? 'normal')
  const [recurrence, setRecurrence] = useState<Recurrence>(existing?.recurrence ?? 'none')
  const [interval, setInterval] = useState(existing?.recurrence_interval ?? 1)
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const errors = {
    title: title.trim() ? null : 'Skriv hvad der skal gøres',
    due: recurrence !== 'none' && !due ? 'En gentagende opgave skal have en dato' : null,
  }
  const valid = !errors.title && !errors.due

  function pickRecurrence(r: Recurrence) {
    setRecurrence(r)
    // Gentagelse kræver en dato – brug i dag, hvis der ikke er valgt en
    if (r !== 'none' && !due) setDue(toIsoDate(new Date()))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || save.isPending) return
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: { title, description, assigneeId: assignee === 'none' ? null : assignee, dueOn: due || null, priority, recurrence, interval },
      })
      goBack('/hjemmet')
    } catch {
      // vises nedenfor
    }
  }

  const next = due && recurrence !== 'none' ? nextDue(due, recurrence, interval) : null

  return (
    <>
      <PageHeader
        title={existing ? existing.title : 'Ny opgave'}
        eyebrow={existing ? statusLabels[existing.status] : undefined}
        back="/hjemmet"
        action={
          existing && (
            <button type="button" aria-label="Slet opgave" onClick={() => setConfirmDelete(true)} className="pressable flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      {existing && (
        <div className="mb-5">
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Status</p>
          <SegmentedControl<TaskStatus>
            label="Status"
            value={setStatus.isPending && setStatus.variables ? setStatus.variables.status : existing.status}
            onChange={(s) => !setStatus.isPending && s !== existing.status && setStatus.mutate({ id: existing.id, status: s })}
            options={(['open', 'in_progress', 'done'] as const).map((s) => ({ value: s, label: statusLabels[s] }))}
          />
          {setStatus.isError && <p className="mt-2 px-1 text-[13px] text-danger">{homeErrorMessage(setStatus.error)}</p>}
          {existing.recurrence !== 'none' && existing.status !== 'done' && (
            <p className="mt-2 px-1 text-[13px] text-secondary">Når den markeres som udført, oprettes næste gang automatisk.</p>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Opgave" error={touched ? errors.title : null}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Støvsuge stuen" maxLength={100} autoFocus={!existing} autoCapitalize="sentences" />
        </Field>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvem</p>
          <SegmentedControl label="Hvem" value={assignee} onChange={setAssignee} options={[{ value: 'none', label: 'Begge' }, ...members.map((m) => ({ value: m.userId, label: m.isMe ? 'Mig' : m.displayName }))]} />
        </div>

        <Field label="Dato" error={touched ? errors.due : null} hint={due ? formatLongDate(fromIsoDate(due)) : 'Ingen dato'}>
          <div className="flex gap-2">
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} className="flex-1" aria-label="Dato" />
            {due && recurrence === 'none' && (
              <button type="button" aria-label="Fjern dato" onClick={() => setDue('')} className="pressable flex size-13 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-secondary">
                <X className="size-5" />
              </button>
            )}
          </div>
        </Field>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Prioritet</p>
          <SegmentedControl label="Prioritet" value={priority} onChange={setPriority} options={(['low', 'normal', 'high'] as const).map((p) => ({ value: p, label: priorityLabels[p] }))} />
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gentag</p>
          <SegmentedControl<Recurrence>
            label="Gentag"
            value={recurrence}
            onChange={pickRecurrence}
            options={[
              { value: 'none', label: 'Nej' },
              { value: 'daily', label: 'Dag' },
              { value: 'weekly', label: 'Uge' },
              { value: 'monthly', label: 'Måned' },
            ]}
          />
          {recurrence !== 'none' && (
            <Card variant="tonal" className="mt-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold">{recurrenceLabel(recurrence, interval)}</p>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Sjældnere" disabled={interval <= 1} onClick={() => setInterval((n) => Math.max(1, n - 1))} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card disabled:text-muted">
                    <Minus className="size-4.5" strokeWidth={2.5} />
                  </button>
                  <span className="tabular w-16 text-center text-[14px] font-semibold" aria-live="polite">
                    {interval} {unitLabel[recurrence][interval === 1 ? 0 : 1]}
                  </span>
                  <button type="button" aria-label="Oftere" disabled={interval >= 52} onClick={() => setInterval((n) => Math.min(52, n + 1))} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card disabled:text-muted">
                    <Plus className="size-4.5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              {next && <p className="mt-2 text-[13px] text-secondary">Næste gang efter denne: {formatLongDate(fromIsoDate(next))}</p>}
            </Card>
          )}
        </div>

        <Field label="Beskrivelse (valgfri)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} />
        </Field>

        {save.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">{homeErrorMessage(save.error)}</p>}
        <Button type="submit" block variant={existing ? 'secondary' : 'primary'} loading={save.isPending}>
          {existing ? 'Gem ændringer' : 'Opret opgave'}
        </Button>
      </form>

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Slet opgave?">
        <p className="text-[15px] text-secondary">
          {existing?.recurrence !== 'none' ? 'Kun denne gang slettes. Tidligere udførte gange bevares.' : 'Opgaven fjernes for jer begge.'}
        </p>
        {del.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{homeErrorMessage(del.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Annullér
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={() => existing && del.mutate(existing.id, { onSuccess: () => goBack('/hjemmet') })}>
            Slet
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
