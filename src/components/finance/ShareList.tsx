import type { ReactNode } from 'react'
import { formatAmount } from '@/lib/money'

export type ShareItem = { key: string; label: string; ore: number; color: string; leading?: ReactNode }

/** Fordeling (Nordnet-agtig): navn, beløb, andel i procent og en tynd bar. */
export function ShareList({ items, total }: { items: ShareItem[]; total: number }) {
  return (
    <ul className="space-y-3.5">
      {items.map((it) => {
        const share = total > 0 ? it.ore / total : 0
        return (
          <li key={it.key}>
            <div className="flex items-center gap-3">
              {it.leading ?? <span className="size-2.5 shrink-0 rounded-full" style={{ background: it.color }} />}
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{it.label}</span>
              <span className="tabular text-[15px] font-semibold">{formatAmount(it.ore, { decimals: 'never' })} kr.</span>
              <span className="tabular w-11 text-right text-[13px] text-text-tertiary">{Math.round(share * 100)} %</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-track">
              <div className="animate-grow h-full rounded-full" style={{ width: `${share * 100}%`, background: it.color }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
