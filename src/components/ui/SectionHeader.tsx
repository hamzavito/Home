import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Overskrift over en sektion på en side, evt. med "Se alle"-link. */
export function SectionHeader({ title, to, linkLabel = 'Se alle', action }: { title: string; to?: string; linkLabel?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between px-1">
      <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
      {to ? (
        <Link to={to} className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text active:opacity-60">
          {linkLabel}
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </Link>
      ) : (
        action
      )}
    </div>
  )
}
