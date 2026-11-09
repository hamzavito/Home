import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CalendarDays, CheckCircle2, ShoppingBasket } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEvents, useShopping, useShoppingRealtime, useTasks } from '@/features/home/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { addDaysIso, eventCovers, eventTimeLabel } from '@/lib/home'
import { fromIsoDate, toIsoDate } from '@/lib/dates'
import { weekDays } from '@/features/calendar/calendarWeek'

const dayFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric' })
const clockFormat = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' })

/** Authenticated household board on trusted screens. NOT a public display or a private-calendar boundary. */
export function BoardPage() {
  const { id: householdId, name } = useHousehold()
  const qc = useQueryClient()
  const [now, setNow] = useState(() => new Date())
  useShoppingRealtime()
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    const refresh = window.setInterval(() => void qc.invalidateQueries({ queryKey: ['home', householdId] }), 60_000)
    return () => { window.clearInterval(clock); window.clearInterval(refresh) }
  }, [householdId, qc])
  const today = toIsoDate(now)
  const days = weekDays(today)
  const events = useEvents(days[0]!, days[6]!)
  const tasks = useTasks()
  const shopping = useShopping()
  // The existing calendar_events RLS is household-wide; this is only display filtering.
  // Never display medical events, notes, bank information or event descriptions.
  const visible = (events.data ?? []).filter(e => ['family', 'work', 'kids', 'vacation'].includes(e.type))
  const openTasks = (tasks.data?.active ?? []).filter(t => !t.due_on || t.due_on <= days[6]!).slice(0, 7)
  const items = (shopping.data?.items ?? []).filter(i => !i.is_checked).slice(0, 8)
  return <main className="min-h-dvh bg-[var(--bg)] px-4 py-6 text-primary sm:px-8 lg:px-10">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><div className="text-sm font-semibold tracking-widest text-accent-text">HOME · FAMILIETAVLE</div><h1 className="mt-1 text-3xl font-bold sm:text-5xl">{name}</h1><p className="mt-1 text-secondary">Familiens uge samlet ét sted</p></div>
      <div className="flex items-center gap-4"><time dateTime={now.toISOString()} className="text-3xl font-bold tabular-nums sm:text-5xl">{clockFormat.format(now)}</time><Link to="/hjemmet" aria-label="Tilbage til Hjemmet" className="rounded-2xl bg-surface-secondary p-3"><ArrowLeft className="size-6"/></Link></div>
    </header>
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
      <section aria-label="Ugens kalender" className="rounded-3xl bg-surface-secondary p-4 sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><CalendarDays className="size-5 text-accent-text"/>Ugekalender</h2>
        {events.isError && <p role="alert" className="mb-3 text-danger">Kunne ikke hente kalenderen.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {days.map(day => <section key={day} className={`min-h-36 rounded-2xl border border-subtle p-3 ${day===today?'bg-surface-accent':'bg-surface-1'}`}>
            <h3 className="mb-3 text-sm font-bold capitalize">{dayFormat.format(fromIsoDate(day))}</h3>
            {(visible.filter(e => eventCovers(e, day))).length ? <ul className="space-y-2">{visible.filter(e => eventCovers(e, day)).map(e => <li key={e.id} className="rounded-xl bg-surface-secondary p-2 text-sm"><span className="block break-words font-semibold">{e.title}</span><span className="text-xs text-secondary">{eventTimeLabel(e)}</span></li>)}</ul> : <p className="text-xs text-secondary">Ingen aftaler</p>}
          </section>)}
        </div>
      </section>
      <aside className="grid content-start gap-4 sm:grid-cols-2 2xl:grid-cols-1">
        <section className="rounded-3xl bg-surface-secondary p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><CheckCircle2 className="size-5 text-accent-text"/>Opgaver</h2>{tasks.isError?<p role="alert" className="text-danger">Kunne ikke hente opgaver.</p>:openTasks.length?<ul className="space-y-3">{openTasks.map(t=><li className="border-b border-subtle pb-2 text-sm" key={t.id}>{t.title}</li>)}</ul>:<p className="text-secondary">Ingen aktuelle opgaver</p>}</section>
        <section className="rounded-3xl bg-surface-secondary p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><ShoppingBasket className="size-5 text-accent-text"/>Indkøb</h2>{shopping.isError?<p role="alert" className="text-danger">Kunne ikke hente indkøb.</p>:items.length?<ul className="space-y-3">{items.map(i=><li className="border-b border-subtle pb-2 text-sm" key={i.id}>{i.name}{i.quantity?` · ${i.quantity}`:''}</li>)}</ul>:<p className="text-secondary">Indkøbslisten er tom</p>}</section>
      </aside>
    </div>
    <p className="mt-6 text-center text-xs text-secondary">Kun til betroede skærme med almindeligt login. Sikker skærmparring og selvstændig adgang kommer senere.</p>
  </main>
}
