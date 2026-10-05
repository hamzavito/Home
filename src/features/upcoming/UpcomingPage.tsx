import { CalendarClock, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useCategories } from '@/features/finance/api'
import { cn } from '@/lib/cn'
import { relativeDay, toIsoDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { useUpcoming, type Upcoming } from './api'
import { DateBadge } from './DateBadge'

export function daysUntil(iso: string, todayIso = toIsoDate(new Date())) {
  const [a, b] = [new Date(`${todayIso}T12:00:00`), new Date(`${iso}T12:00:00`)]
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function dueLabel(iso: string): string {
  const n = daysUntil(iso)
  if (n < -1) return `Forfaldt for ${-n} dage siden`
  if (n === -1) return 'Forfaldt i går'
  if (n === 0) return 'I dag'
  if (n === 1) return 'I morgen'
  if (n <= 30) return `Om ${n} dage`
  return relativeDay(iso)
}

export function UpcomingRow({ u, categoryName }: { u: Upcoming; categoryName?: string }) {
  const overdue = u.status === 'upcoming' && daysUntil(u.due_on) < 0
  const done = u.status !== 'upcoming'
  return (
    <Link to={`/okonomi/kommende/${u.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-secondary">
      <DateBadge iso={u.due_on} tone={overdue ? 'overdue' : done ? 'muted' : 'default'} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[16px] font-semibold', u.status === 'cancelled' && 'text-secondary line-through')}>{u.title}</p>
        <p className={cn('truncate text-[13px]', overdue ? 'font-semibold text-notice' : 'text-secondary')}>
          {u.status === 'paid' ? 'Betalt' : u.status === 'cancelled' ? 'Annulleret' : dueLabel(u.due_on)}
          {categoryName ? ` · ${categoryName}` : ''}
        </p>
      </div>
      <Money ore={u.amount_ore} size="md" className={done ? 'text-secondary' : undefined} />
    </Link>
  )
}

export function UpcomingPage() {
  const navigate = useNavigate()
  const upcoming = useUpcoming()
  const categories = useCategories()
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name
  const list = upcoming.data ?? []
  const open = list.filter((u) => u.status === 'upcoming')
  const overdue = open.filter((u) => daysUntil(u.due_on) < 0)
  const next30 = open.filter((u) => daysUntil(u.due_on) >= 0 && daysUntil(u.due_on) <= 30)
  const later = open.filter((u) => daysUntil(u.due_on) > 30)
  const done = list.filter((u) => u.status !== 'upcoming').sort((a, b) => b.due_on.localeCompare(a.due_on)).slice(0, 20)
  const sum30 = [...overdue, ...next30].reduce((s, u) => s + u.amount_ore, 0)

  const section = (title: string, items: Upcoming[]) =>
    items.length > 0 && (
      <>
        <SectionHeader title={title} />
        <Card padded={false} className="divide-y divide-subtle">
          {items.map((u) => (
            <UpcomingRow key={u.id} u={u} categoryName={catName(u.category_id)} />
          ))}
        </Card>
      </>
    )

  return (
    <>
      <PageHeader
        title="Kommende udgifter"
        back="/okonomi"
        action={
          <Button size="sm" onClick={() => navigate('/okonomi/kommende/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Ny
          </Button>
        }
      />
      {upcoming.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : open.length === 0 && done.length === 0 ? (
        <Card variant="tonal">
          <EmptyState icon={CalendarClock} title="Ingen kommende udgifter" text="Fx tandlæge, bilservice eller en større betaling. Planen påvirker ikke budgettet, før I markerer den som betalt.">
            <Button size="sm" onClick={() => navigate('/okonomi/kommende/ny')}>
              Tilføj kommende udgift
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card variant="hero" className="p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-hero-text-secondary">De næste 30 dage</p>
            <Money ore={sum30} size="xl" className="mt-2 block" />
            <p className="mt-1 text-[14px] text-hero-text-secondary">
              {next30.length + overdue.length} {next30.length + overdue.length === 1 ? 'udgift' : 'udgifter'}
              {overdue.length > 0 && ` · ${overdue.length} forfaldne`}
              {later.length > 0 && ` · ${formatAmount(later.reduce((s, u) => s + u.amount_ore, 0), { decimals: 'never' })} kr. senere`}
            </p>
          </Card>
          {section('Forfaldne', overdue)}
          {section('Kommende', next30)}
          {section('Senere', later)}
          {section('Afsluttede', done)}
        </>
      )}
    </>
  )
}
