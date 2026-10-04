import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

/** Stor iOS-agtig sidetitel. Med `back` vises en tilbage-knap. */
export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: boolean; action?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="pb-2 pt-4">
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-2 mb-1 flex items-center text-[17px] text-accent active:opacity-60"
        >
          <ChevronLeft className="size-6" /> Tilbage
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {subtitle && <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{subtitle}</p>}
          <h1 className="truncate font-display text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
        </div>
        {action}
      </div>
    </header>
  )
}
