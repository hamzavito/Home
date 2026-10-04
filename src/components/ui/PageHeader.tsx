import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

type Props = { title: string; eyebrow?: string; back?: boolean | string; action?: ReactNode }

/** Sidehoved. `back` viser en rund tilbage-knap (true = historik, streng = sti). */
export function PageHeader({ title, eyebrow, back, action }: Props) {
  const navigate = useNavigate()
  return (
    <header className="pb-3 pt-3">
      {back && (
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Tilbage"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="pressable -ml-1 flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card"
          >
            <ChevronLeft className="size-5" strokeWidth={2.5} />
          </button>
          {action}
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="mb-0.5 text-[14px] font-medium text-secondary">{eyebrow}</p>}
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.025em]">{title}</h1>
        </div>
        {!back && action}
      </div>
    </header>
  )
}
