import { Plus } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'

const tabs = [
  { to: '/okonomi', label: 'Overblik', end: true },
  { to: '/okonomi/budgetter', label: 'Budgetter', end: true },
  { to: '/okonomi/faste', label: 'Faste poster', end: true },
  { to: '/okonomi/transaktioner', label: 'Transaktioner', end: true },
  { to: '/okonomi/indtaegter', label: 'Indtægter', end: true },
]

/** Økonomi med faner. Valgt måned (?m=) følger med mellem fanerne. */
export function FinanceLayout() {
  const navigate = useNavigate()
  const { search } = useLocation()
  return (
    <>
      <PageHeader
        title="Økonomi"
        action={
          <Button size="sm" onClick={() => navigate('/okonomi/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Udgift
          </Button>
        }
      />
      <nav aria-label="Økonomi" className="-mx-1 mb-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <ul className="flex w-max gap-1.5 rounded-full bg-surface-secondary p-1">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                // Aktiv fane scrolles ind i synsfeltet på smalle skærme
                ref={(el) => {
                  if (el?.getAttribute('aria-current') === 'page') el.scrollIntoView({ block: 'nearest', inline: 'center' })
                }}
                to={{ pathname: t.to, search }}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'block whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
                    isActive ? 'bg-surface-elevated text-primary shadow-raised' : 'text-secondary',
                  )
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  )
}
