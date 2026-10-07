import { CalendarDays, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useGoBack } from '@/app/useGoBack'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { homeErrorMessage, useDeleteEvent, useEvent, useSaveEvent, type CalendarEvent } from '@/features/home/api'
import { eventTypeOrder, eventTypes } from '@/features/home/meta'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatLongDate, formatWeekday, fromIsoDate, toIsoDate } from '@/lib/dates'
import { addDaysIso, timeInputValue } from '@/lib/home'
import type { EventType } from '@/types/database'
import { Toggle } from '@/components/ui/Toggle'
import { familyLabel } from './forWhom'
import { defaultReminder, reminderAfterAllDayChange, reminderChoices } from './reminders'

export function EventFormPage() {
  const { id } = useParams()
  const event = useEvent(id)
  if (id && event.isPending) return <FullScreenLoader />
  if (id && !event.data)
    return (
      <>
        <PageHeader title="Aftale" back="/hjemmet/kalender" />
        <EmptyState icon={CalendarDays} title="Aftalen findes ikke" text="Den kan være slettet på den anden telefon." />
      </>
    )
  return <EventForm key={id ?? 'new'} existing={event.data ?? undefined} />
}

function EventForm({ existing }: { existing?: CalendarEvent }) {
  const goBack = useGoBack()
  const [params] = useSearchParams()
  const { members } = useHousehold()
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const preset = params.get('dato')
  const initialDate = existing?.event_date ?? (preset && /^\d{4}-\d{2}-\d{2}$/.test(preset) ? preset : toIsoDate(new Date()))
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(initialDate)
  const [multiDay, setMultiDay] = useState(Boolean(existing?.end_date))
  const [endDate, setEndDate] = useState(existing?.end_date ?? initialDate)
  const [allDay, setAllDay] = useState(existing?.all_day ?? false)
  const [start, setStart] = useState(timeInputValue(existing?.start_time) || '09:00')
  const [end, setEnd] = useState(timeInputValue(existing?.end_time))
  const [type, setType] = useState<EventType>(existing?.type ?? 'family')
  // Deltagere (tidligere medlemmer udelades). Tom = hele familien. ?deltager= forudvælger en person.
  const presetFor = params.get('deltager')
  const [participants, setParticipants] = useState<string[]>(() =>
    existing
      ? (existing.participant_ids ?? []).filter((id) => members.some((m) => m.userId === id))
      : presetFor && members.some((m) => m.userId === presetFor)
        ? [presetFor]
        : [],
  )
  const [reminder, setReminder] = useState<number | null>(existing ? existing.reminder_minutes : defaultReminder(false))
  const [description, setDescription] = useState(existing?.description ?? '')
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const back = `/hjemmet/kalender${existing ? '' : `?dag=${date}${date.slice(0, 7) !== toIsoDate(new Date()).slice(0, 7) ? `&m=${date.slice(0, 7)}` : ''}`}`

  const errors = {
    title: title.trim() ? null : 'Skriv hvad aftalen er',
    start: !allDay && !start ? 'Vælg starttid' : null,
    end: multiDay && endDate < date ? 'Slutdatoen skal være efter startdatoen' : !allDay && !multiDay && end && end <= start ? 'Sluttid skal være efter starttid' : null,
  }
  const valid = !errors.title && !errors.start && !errors.end
  const creator = members.find((m) => m.userId === existing?.created_by)
  const chosen = members.filter((m) => participants.includes(m.userId))
  const reminderTo =
    chosen.length === 0
      ? members.length === 2
        ? 'jer begge'
        : 'hele familien'
      : chosen.length === 1 && chosen[0]!.isMe
        ? 'dig'
        : chosen.map((m) => (m.isMe ? 'dig' : m.displayName)).join(', ').replace(/, ([^,]*)$/, ' og $1')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || save.isPending) return
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          title,
          date,
          endDate: multiDay ? endDate : null,
          allDay,
          startTime: allDay ? null : start,
          endTime: allDay ? null : end || null,
          description,
          type,
          participantIds: participants,
          reminderMinutes: reminder,
        },
      })
      goBack(back)
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader
        title={existing ? existing.title : 'Ny aftale'}
        eyebrow={existing ? formatWeekday(fromIsoDate(existing.event_date)) : undefined}
        back={back}
        action={
          existing && (
            <button type="button" aria-label="Slet aftale" onClick={() => setConfirmDelete(true)} className="pressable flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </button>
          )
        }
      />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Titel" error={touched ? errors.title : null}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Lægetid" maxLength={100} autoFocus={!existing} autoCapitalize="sentences" />
        </Field>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gælder for</p>
          <div role="group" aria-label="Gælder for" className="flex flex-wrap gap-2">
            <ChoiceChip label={familyLabel(members)} checked={participants.length === 0} onClick={() => setParticipants([])} />
            {members.map((m) => (
              <ChoiceChip
                key={m.userId}
                label={m.displayName}
                checked={participants.includes(m.userId)}
                onClick={() => setParticipants((p) => (p.includes(m.userId) ? p.filter((x) => x !== m.userId) : [...p, m.userId]))}
              />
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[13px] text-secondary">Vælg én eller flere. {familyLabel(members)} = alle i husstanden kan se aftalen.</p>
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Type</p>
          <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
            {eventTypeOrder.map((t) => {
              const meta = eventTypes[t]
              const Icon = meta.icon
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn(
                    'pressable flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                    type === t ? 'bg-surface-elevated text-primary shadow-raised ring-2 ring-accent' : 'bg-surface-secondary text-secondary',
                  )}
                >
                  <Icon className="size-4" style={{ color: meta.color }} strokeWidth={2.4} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <Field label={multiDay ? 'Fra' : 'Dato'} hint={formatLongDate(fromIsoDate(date))}>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return
              setDate(e.target.value)
              if (endDate < e.target.value) setEndDate(e.target.value)
            }}
          />
        </Field>

        <div className="divide-y divide-subtle overflow-hidden rounded-2xl bg-surface-primary shadow-card ring-1 ring-subtle">
          <Toggle
            label="Hele dagen"
            checked={allDay}
            onChange={(v) => {
              setAllDay(v)
              setReminder((r) => reminderAfterAllDayChange(r, v))
            }}
          />
          <Toggle
            label="Flere dage"
            checked={multiDay}
            onChange={(v) => {
              setMultiDay(v)
              // Foreslå dagen efter som slutdato
              if (v && endDate <= date) setEndDate(addDaysIso(date, 1))
            }}
          />
        </div>

        {multiDay && (
          <Field label="Til og med" error={touched ? errors.end : null} hint={formatLongDate(fromIsoDate(endDate))}>
            <TextInput type="date" value={endDate} min={date} onChange={(e) => e.target.value && setEndDate(e.target.value)} />
          </Field>
        )}

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" error={touched ? errors.start : null}>
              <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Slut (valgfri)" error={touched && !multiDay ? errors.end : null}>
              <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="Påmindelse" hint={reminder === null ? 'Ingen notifikation' : `Sendes til ${reminderTo}, hvis notifikationer er slået til`}>
          <SelectInput value={reminder === null ? 'none' : String(reminder)} onChange={(e) => setReminder(e.target.value === 'none' ? null : Number(e.target.value))}>
            {reminderChoices(allDay, reminder).map((c) => (
              <option key={String(c.value)} value={c.value === null ? 'none' : String(c.value)}>
                {c.label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Beskrivelse (valgfri)" hint="Kan ses af alle, aftalen gælder for – også børn.">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
        </Field>

        {existing && (
          <p className="px-1 text-[13px] text-secondary">
            Oprettet af {creator?.displayName ?? 'ukendt'} · {formatLongDate(new Date(existing.created_at))}
          </p>
        )}

        {save.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">{homeErrorMessage(save.error)}</p>}
        <Button type="submit" block variant={existing ? 'secondary' : 'primary'} loading={save.isPending}>
          {existing ? 'Gem ændringer' : 'Opret aftale'}
        </Button>
      </form>

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Slet aftale?">
        <p className="text-[15px] text-secondary">Aftalen fjernes fra kalenderen for jer begge.</p>
        {del.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{homeErrorMessage(del.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Annullér
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={() => existing && del.mutate(existing.id, { onSuccess: () => goBack('/hjemmet/kalender') })}>
            Slet
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

function ChoiceChip({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', checked ? 'bg-accent text-on-accent' : 'bg-surface-primary text-primary shadow-card')}
    >
      {label}
    </button>
  )
}
