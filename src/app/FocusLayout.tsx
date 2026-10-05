import { Outlet, useLocation } from 'react-router'

/** Fuldskærmsflow uden bundmenu (fx scanning af kvittering). */
export function FocusLayout() {
  const location = useLocation()
  return (
    <div className="min-h-dvh pt-safe">
      <main key={location.pathname} className="animate-page mx-auto max-w-lg px-safe pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  )
}
