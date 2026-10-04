import { Ellipsis, Home, House, Plus, Wallet } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'

type Props = { onAdd: () => void }

const tabs = [
  { to: '/', label: 'Hjem', icon: Home, end: true },
  { to: '/okonomi', label: 'Økonomi', icon: Wallet, end: false },
  null, // plads til +-knappen
  { to: '/hjemmet', label: 'Hjemmet', icon: House, end: false },
  { to: '/mere', label: 'Mere', icon: Ellipsis, end: false },
] as const

export function BottomNav({ onAdd }: Props) {
  return (
    <nav aria-label="Hovednavigation" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-separator pb-safe">
      <ul className="mx-auto grid h-[58px] max-w-lg grid-cols-5 items-center">
        {tabs.map((tab, i) =>
          tab === null ? (
            <li key="add" className="flex justify-center">
              <button
                type="button"
                onClick={onAdd}
                aria-label="Tilføj"
                className="-mt-5 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_6px_20px_rgb(47_125_109_/_0.4)] transition active:scale-95"
              >
                <Plus className="size-7" strokeWidth={2.5} />
              </button>
            </li>
          ) : (
            <li key={i}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors',
                    isActive ? 'text-accent' : 'text-text-secondary',
                  )
                }
              >
                <tab.icon className="size-6" strokeWidth={2} />
                {tab.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
