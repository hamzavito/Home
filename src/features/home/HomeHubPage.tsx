import { CheckSquare, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { sections } from '@/app/sections'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { dayLabel, toIsoDate } from '@/lib/dates'
import { addDaysIso, compareEvents, eventTimeLabel, taskBucket, type TaskBucket } from '@/lib/home'
import { useWeek } from '@/features/mealplan/api'
import { weekStart } from '@/lib/recipes'
import { useEvents, useShopping, useTasks, type Task } from './api'
import { TaskRow } from './TaskRow'

const bucketTitles: Record<TaskBucket, string> = { overdue: 'Forfaldne', today: 'I dag', week: 'Denne uge', later: 'Senere', none: 'Uden dato' }
const bucketOrder: TaskBucket[] = ['overdue', 'today', 'week', 'later', 'none']

export function HomeHubPage() {
  const navigate = useNavigate()
  const { me } = useHousehold()
  const tasks = useTasks()
  const shopping = useShopping()
  const today = toIsoDate(new Date())
  const events = useEvents(today, addDaysIso(today, 30))
  const meals = useWeek(weekStart(today))
  const todaysMeals = (meals.data ?? []).filter((m) => m.plan_date === today)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [showDone, setShowDone] = useState(false)

  const active = (tasks.data?.active ?? []).filter((t) => filter === 'all' || t.assignee_id === me.userId || t.assignee_id === null)
  const grouped = new Map<TaskBucket, Task[]>()
  for (const t of active) {
    const b = taskBucket(t.due_on, today)
    grouped.set(b, [...(grouped.get(b) ?? []), t])
  }
  const done = tasks.data?.done ?? []
  const left = (shopping.data?.items ?? []).filter((i) => !i.is_checked).length
  const nextEvent = [...(events.data ?? [])].sort(compareEvents)[0]

  return (
    <>
      <PageHeader
        title="Hjemmet"
        action={
          <Button size="sm" onClick={() => navigate('/hjemmet/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Opgave
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <QuickCard to={sections.shopping.path} icon={sections.shopping.icon} color={sections.shopping.color} title="Indkøb" text={shopping.isPending ? ' ' : left === 0 ? 'Listen er tom' : `${left} ${left === 1 ? 'vare' : 'varer'} tilbage`} />
        <QuickCard
          to={sections.calendar.path}
          icon={sections.calendar.icon}
          color={sections.calendar.color}
          title="Kalender"
          text={events.isPending ? ' ' : nextEvent ? `${dayLabel(nextEvent.event_date < today ? today : nextEvent.event_date)}: ${nextEvent.title}` : 'Intet de næste 30 dage'}
          sub={nextEvent ? eventTimeLabel(nextEvent) : undefined}
        />
        <Link to={sections.mealplan.path} className="pressable col-span-2 flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: `color-mix(in srgb, ${sections.mealplan.color} 16%, transparent)` }}>
            <sections.mealplan.icon className="size-5" style={{ color: sections.mealplan.color }} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold tracking-tight">Madplan</span>
            <span className="block text-[13px] text-secondary">
              {meals.isPending ? ' ' : todaysMeals.length ? `I aften: ${todaysMeals.map((m) => m.title).join(', ')}` : 'Intet planlagt i aften'}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" />
        </Link>
      </div>

      <SectionHeader title="Opgaver" />
      <SegmentedControl
        label="Vis opgaver"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'mine', label: 'Mine' },
        ]}
      />

      {tasks.isPending ? (
        <Skeleton className="mt-4 h-48 rounded-card" />
      ) : tasks.isError ? (
        <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">Opgaverne kunne ikke hentes. Prøv igen.</p>
      ) : active.length === 0 ? (
        <Card variant="tonal" className="mt-4">
          <EmptyState compact icon={CheckSquare} title={filter === 'mine' ? 'Ingen opgaver til dig' : 'Ingen åbne opgaver'} text="Fx støvsugning hver uge eller at skifte filter i emhætten hver 3. måned.">
            <Button size="sm" variant="surface" onClick={() => navigate('/hjemmet/ny')}>
              Ny opgave
            </Button>
          </EmptyState>
        </Card>
      ) : (
        bucketOrder.map(
          (b) =>
            grouped.get(b) && (
              <section key={b} className="mt-5">
                <h3 className={cn('mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em]', b === 'overdue' ? 'text-notice' : 'text-secondary')}>{bucketTitles[b]}</h3>
                <Card padded={false} className="divide-y divide-subtle">
                  {grouped.get(b)!.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </Card>
              </section>
            ),
        )
      )}

      {done.length > 0 && (
        <>
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="mt-6 flex w-full items-center justify-between rounded-2xl px-1 py-2 text-[15px] font-semibold text-secondary">
            Udført for nylig ({done.length})
            <ChevronDown className={cn('size-5 transition-transform', showDone && 'rotate-180')} />
          </button>
          {showDone && (
            <Card padded={false} className="mt-2 divide-y divide-subtle">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Card>
          )}
        </>
      )}
    </>
  )
}

function QuickCard({ to, icon: Icon, color, title, text, sub }: { to: string; icon: typeof CheckSquare; color: string; title: string; text: string; sub?: string }) {
  return (
    <Link to={to} className="pressable flex min-h-[132px] flex-col rounded-card bg-surface-primary p-4 shadow-card">
      <span className="flex size-10 items-center justify-center rounded-[14px]" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
        <Icon className="size-5" style={{ color }} strokeWidth={2.2} />
      </span>
      <p className="mt-auto pt-3 text-[17px] font-bold tracking-tight">{title}</p>
      <p className="line-clamp-2 text-[13px] text-secondary">{text}</p>
      {sub && <p className="text-[13px] text-secondary">{sub}</p>}
    </Link>
  )
}
