import { Link } from 'react-router'
import { eventTypes } from '@/features/home/meta'
import type { CalendarEvent } from '@/features/home/api'
import { formatShortDate, fromIsoDate } from '@/lib/dates'
import { eventTimeLabel } from '@/lib/home'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { ForWhomBadge, whoLabel } from './forWhom'

/** Aftale i en liste: typeikon, titel, hvem den gælder for og tid. */
export function EventRow({ e, showDate, linkTo, showNote }: { e: CalendarEvent; showDate?: string; /** null = kun visning (fx for børn) */ linkTo?: string | null; /** Vis aftalens note (børn kan ikke åbne aftalen) */ showNote?: boolean }) {
  const { members } = useHousehold()
  const who = whoLabel(e.participant_ids, members)
  const t = eventTypes[e.type]
  const Icon = t.icon
  const range = e.end_date ? `${formatShortDate(fromIsoDate(e.event_date))} – ${formatShortDate(fromIsoDate(e.end_date))}` : null
  return (
    <Row to={linkTo === undefined ? `/hjemmet/kalender/${e.id}` : linkTo}>
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
        {showNote && e.description && (
          <span className="mt-1.5 block whitespace-pre-line break-words rounded-xl bg-surface-secondary px-3 py-2 text-[14px] leading-snug text-primary">{e.description}</span>
        )}
      </span>
      <ForWhomBadge participantIds={e.participant_ids} members={members} className="size-7 text-[11px]" />
    </Row>
  )
}

function Row({ to, children }: { to: string | null; children: React.ReactNode }) {
  const cls = 'flex items-center gap-3 px-4 py-3 transition-colors'
  if (!to) return <div className={cls}>{children}</div>
  return (
    <Link to={to} className={`${cls} active:bg-surface-secondary`}>
      {children}
    </Link>
  )
}
