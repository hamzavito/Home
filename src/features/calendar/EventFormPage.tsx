import { CalendarDays, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, TextArea, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { homeErrorMessage, useDeleteEvent, useEvent, useSaveEvent, type CalendarEvent } from '@/features/home/api'
import { eventTypeOrder, eventTypes } from '@/features/home/meta'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatLongDate, formatWeekday, fromIsoDate, toIsoDate } from '@/lib/dates'
import { addDaysIso, timeInputValue } from '@/lib/home'
import type { EventType } from '@/types/database'

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
  const navigate = useNavigate()
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || save.isPending) return
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: { title, date, endDate: multiDay ? endDate : null, allDay, startTime: allDay ? null : start, endTime: allDay ? null : end || null, description, type },
      })
      navigate(back, { replace: true })
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
          <Toggle label="Hele dagen" checked={allDay} onChange={setAllDay} />
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

        <Field label="Beskrivelse (valgfri)">
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
          <Button variant="danger" loading={del.isPending} onClick={() => existing && del.mutate(existing.id, { onSuccess: () => navigate('/hjemmet/kalender', { replace: true }) })}>
            Slet
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-[56px] w-full items-center justify-between px-4 text-left">
      <span className="text-[16px] font-medium">{label}</span>
      <span className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', checked ? 'bg-positive' : 'bg-surface-tertiary')}>
        <span className={cn('absolute top-[2px] size-[27px] rounded-full bg-white shadow-raised transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
      </span>
    </button>
  )
}
