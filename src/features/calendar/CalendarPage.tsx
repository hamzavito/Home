import { CalendarDays, Plus, Monitor, Download } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useEvents } from '@/features/home/api'
import { eventTypes } from '@/features/home/meta'
import { cn } from '@/lib/cn'
import { dayLabel, fromIsoDate, toIsoDate } from '@/lib/dates'
import { addDaysIso, addMonthsIso, compareEvents, eventCovers, monthGrid } from '@/lib/home'
import { EventRow } from './EventRow'
import { weekDays } from './calendarWeek'
import { downloadIcsFile, serializeIcs } from './icsExport'

const WEEKDAYS = [
  ['M', 'mandag'],
  ['T', 'tirsdag'],
  ['O', 'onsdag'],
  ['T', 'torsdag'],
  ['F', 'fredag'],
  ['L', 'lørdag'],
  ['S', 'søndag'],
] as const

const dayAria = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })

export function CalendarPage() {
  const navigate = useNavigate()
  const [month] = useMonthParam()
  const [params, setParams] = useSearchParams()
  const today = toIsoDate(new Date())
  const grid = monthGrid(month)
  const monthEvents = useEvents(grid[0]!, grid.at(-1)!)
  const upcoming = useEvents(today, addDaysIso(today, 60))

  const rawDay = params.get('dag')
  const selected = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : month.slice(0, 7) === today.slice(0, 7) ? today : month
  const selectDay = (iso: string) => {
    const next = new URLSearchParams(params)
    next.set('dag', iso)
    if (iso.slice(0, 7) !== month.slice(0, 7)) {
      if (iso.slice(0, 7) === today.slice(0, 7)) next.delete('m')
      else next.set('m', iso.slice(0, 7))
    }
    setParams(next, { replace: true })
  }
  const changeMonth = (m: string) => {
    const next = new URLSearchParams(params)
    next.delete('dag')
    if (m.slice(0, 7) === today.slice(0, 7)) next.delete('m')
    else next.set('m', m.slice(0, 7))
    setParams(next, { replace: true })
  }

  const all = [...(monthEvents.data ?? [])].sort(compareEvents)
  const dayEvents = all.filter((e) => eventCovers(e, selected))
  const week = weekDays(selected)
  const nextEvents = [...(upcoming.data ?? [])].sort(compareEvents).slice(0, 8)
  const lastOfMonth = addDaysIso(addMonthsIso(month, 1), -1)
  const exportEvents = all.filter(e => e.event_date <= lastOfMonth && (e.end_date ?? e.event_date) >= month)
  const exportMonth = () => {
    // Browserfilen oprettes kun efter et aktivt klik. Ingen personlige data sendes til en tredjepart.
    downloadIcsFile(serializeIcs(exportEvents), `home-kalender-${month.slice(0, 7)}.ics`)
  }

  return (
    <>
      <PageHeader
        title="Kalender"
        back="/hjemmet"
        action={
          <Button size="sm" onClick={() => navigate(`/hjemmet/kalender/ny?dato=${selected}`)}>
            <Plus className="size-4" strokeWidth={2.6} /> Aftale
          </Button>
        }
      />
      <MonthSwitcher month={month} onChange={changeMonth} />
      <div className="mt-3 flex flex-col gap-1.5">
        <Button size="sm" variant="secondary" className="self-start" onClick={exportMonth} disabled={monthEvents.isPending || monthEvents.isError || exportEvents.length === 0}>
          <Download className="size-4" /> Eksportér måneden (.ics)
        </Button>
        <p className="text-[12px] text-secondary">Gem en kopi af månedens aftaler til Apple Kalender eller Google Kalender. Ingen automatisk synkronisering; filen kan indeholde private aftaletitler.</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Ugeoversigt</h2>
        <Link to="/tavle" className="inline-flex items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm font-semibold"><Monitor className="size-4" /> Familietavle</Link>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1" role="group" aria-label="Vælg dag i ugen">
        {week.map((iso) => {
          const count = all.filter((e) => eventCovers(e, iso)).length
          return <button key={iso} type="button" onClick={() => selectDay(iso)} aria-pressed={selected === iso} aria-label={dayAria.format(fromIsoDate(iso)) + (count ? `, ${count} aftaler` : '')} className={cn('flex flex-col items-center gap-1 rounded-xl py-3 text-sm', selected === iso ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}>
            <span className="text-xs opacity-80">{['Man','Tir','Ons','Tor','Fre','Lør','Søn'][week.indexOf(iso)]}</span>
            <span className="font-bold tabular-nums">{fromIsoDate(iso).getDate()}</span>
            <span className={cn('size-1.5 rounded-full', count ? 'bg-current' : 'bg-transparent')} />
          </button>
        })}
      </div>

      <Card className="mt-3 px-3 pb-3 pt-4">
        <div className="grid grid-cols-7 text-center" aria-hidden>
          {WEEKDAYS.map(([s], i) => (
            <span key={i} className="pb-2 text-[12px] font-semibold text-secondary">
              {s}
            </span>
          ))}
        </div>
        <div role="grid" aria-label="Måned" className="grid grid-cols-7 gap-y-1">
          {grid.map((iso) => {
            const inMonth = iso.slice(0, 7) === month.slice(0, 7)
            const evs = all.filter((e) => eventCovers(e, iso))
            const isSel = iso === selected
            const isToday = iso === today
            const types = [...new Set(evs.map((e) => e.type))].slice(0, 3)
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={isSel}
                aria-label={`${dayAria.format(fromIsoDate(iso))}${isToday ? ', i dag' : ''}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'aftale' : 'aftaler'}` : ''}`}
                onClick={() => selectDay(iso)}
                className="flex h-12 flex-col items-center justify-center gap-1 rounded-2xl"
              >
                <span
                  className={cn(
                    'tabular flex size-8 items-center justify-center rounded-full text-[15px] font-semibold',
                    isSel ? 'bg-accent text-on-accent' : isToday ? 'bg-surface-accent text-accent-text' : inMonth ? 'text-primary' : 'text-muted',
                  )}
                >
                  {fromIsoDate(iso).getDate()}
                </span>
                <span className="flex h-1.5 gap-0.5">
                  {types.map((t) => (
                    <span key={t} className="size-1.5 rounded-full" style={{ backgroundColor: eventTypes[t].color }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <SectionHeader title={dayLabel(selected)} />
      {monthEvents.isPending ? (
        <Skeleton className="h-24 rounded-card" />
      ) : dayEvents.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CalendarDays} title="Ingen aftaler">
            <Button size="sm" variant="surface" onClick={() => navigate(`/hjemmet/kalender/ny?dato=${selected}`)}>
              Tilføj aftale
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {dayEvents.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </Card>
      )}

      <SectionHeader title="Kommende" />
      {upcoming.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : nextEvents.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CalendarDays} title="Intet de næste 60 dage" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {nextEvents.map((e) => (
            <EventRow key={e.id} e={e} showDate={e.end_date ? undefined : dayLabel(e.event_date)} />
          ))}
        </Card>
      )}
    </>
  )
}
