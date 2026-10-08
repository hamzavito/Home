import { CalendarDays, CheckSquare, Ellipsis, LayoutGrid, Wallet } from 'lucide-react'
import { Navigate, NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/cn'
import { ChildDinnerPage } from './ChildDinnerPage'
import { ChildCalendar, ChildHome, ChildMoney, ChildMore, ChildTasks } from './ChildPages'
import { SubscriptionBanner } from '@/features/billing/SubscriptionBanner'

const tabs = [
  { to: '/', label: 'Hjem', icon: LayoutGrid },
  { to: '/opgaver', label: 'Opgaver', icon: CheckSquare },
  { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  { to: '/penge', label: 'Penge', icon: Wallet },
  { to: '/mere', label: 'Mere', icon: Ellipsis },
] as const

/**
 * Appen for børn: kun egne opgaver, kalender, aftensmad og lommepenge.
 * Alle andre adresser sendes til forsiden. Databasen afviser i forvejen alt andet (RLS).
 */
export function ChildApp() {
  const location = useLocation()
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const dinner = /^\/aftensmad\/([0-9a-f-]{36})$/.exec(path)
  const page =
    path === '/' ? <ChildHome /> :
    path === '/opgaver' ? <ChildTasks /> :
    path === '/kalender' ? <ChildCalendar /> :
    path === '/penge' ? <ChildMoney /> :
    path === '/mere' ? <ChildMore /> :
    dinner ? <ChildDinnerPage id={dinner[1]!} /> :
    null
  if (!page) return <Navigate to="/" replace />

  return (
    <div className="min-h-dvh pt-safe">
      <main key={path} className="animate-page mx-auto max-w-lg px-safe pb-[calc(110px+env(safe-area-inset-bottom))]">
        <SubscriptionBanner />
        {page}
      </main>
      <nav aria-label="Hovednavigation" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ul className="glass mx-auto grid h-[66px] max-w-md grid-cols-5 items-center rounded-[26px] border border-[var(--border-subtle)] px-1 shadow-raised">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end
                className={({ isActive }) => cn('flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors', isActive ? 'text-primary' : 'text-muted')}
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
          ))}
        </ul>
      </nav>
    </div>
  )
}
