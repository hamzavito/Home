import { Ellipsis, House, LayoutGrid, Plus, Wallet } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

type Props = { onAdd: () => void }

const tabs = [
  { to: '/', label: 'Hjem', icon: LayoutGrid, end: true },
  { to: '/okonomi', label: 'Økonomi', icon: Wallet, end: false },
  null, // plads til +-knappen
  { to: '/hjemmet', label: 'Hjemmet', icon: House, end: false },
  { to: '/mere', label: 'Mere', icon: Ellipsis, end: false },
] as const

export function BottomNav({ onAdd }: Props) {
  return (
    <nav aria-label="Hovednavigation" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <ul className="glass mx-auto grid h-[66px] max-w-md grid-cols-5 items-center rounded-[26px] border border-[var(--border-subtle)] px-1 shadow-raised">
        {tabs.map((tab, i) =>
          tab === null ? (
            <li key="add" className="flex justify-center">
              <button
                type="button"
                onClick={onAdd}
                aria-label="Tilføj"
                className="pressable flex size-[52px] items-center justify-center rounded-[18px] bg-accent text-on-accent shadow-[0_10px_24px_-8px_var(--accent)]"
              >
                <Plus className="size-7" strokeWidth={2.6} />
              </button>
            </li>
          ) : (
            <li key={i}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors', isActive ? 'text-primary' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200', isActive && 'bg-surface-accent')}>
                      <tab.icon className={cn('size-[21px]', isActive && 'text-accent-text')} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {tab.label}
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
