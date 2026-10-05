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
        {/* Titel ombrydes i fuld længde i stedet for at blive afkortet */}
        <span className="block break-words text-[16px] font-semibold leading-snug">{e.title}</span>
        {/* Hvem + tid: hver del holdes samlet og brydes hellere til ny linje end at blive skåret over */}
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug text-secondary">
          <span className="max-w-full truncate font-semibold text-primary">{who}</span>
          <span aria-hidden>·</span>
          <span className="tabular whitespace-nowrap">{range ?? eventTimeLabel(e)}</span>
        </span>
        {showDate && <span className="block text-[13px] leading-snug text-secondary">{showDate}</span>}
      </span>
      <ForWhomBadge forUserId={e.for_user_id} members={members} className="size-7 text-[11px]" />
    </Link>
  )
}
