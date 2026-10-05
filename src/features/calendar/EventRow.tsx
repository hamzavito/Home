import { Link } from 'react-router'
import { eventTypes } from '@/features/home/meta'
import type { CalendarEvent } from '@/features/home/api'
import { formatShortDate, fromIsoDate } from '@/lib/dates'
import { eventTimeLabel } from '@/lib/home'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { ForWhomBadge, forWhom } from './forWhom'

/** Aftale i en liste: typeikon, titel, hvem den gælder for og tid. */
export function EventRow({ e, showDate }: { e: CalendarEvent; showDate?: string }) {
  const { members } = useHousehold()
  const who = forWhom(e.for_user_id, members).label
  const t = eventTypes[e.type]
  const Icon = t.icon
  const range = e.end_date ? `${formatShortDate(fromIsoDate(e.event_date))} – ${formatShortDate(fromIsoDate(e.end_date))}` : null
  return (
    <Link to={`/hjemmet/kalender/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-secondary">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: `color-mix(in srgb, ${t.color} 16%, transparent)` }}>
        <Icon className="size-5" style={{ color: t.color }} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">{e.title}</span>
        <span className="block truncate text-[13px] text-secondary">
          <span className="font-semibold text-primary">{who}</span>
          {' · '}
          {[showDate, range ?? eventTimeLabel(e)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ForWhomBadge forUserId={e.for_user_id} members={members} className="size-7 text-[11px]" />
    </Link>
  )
}
