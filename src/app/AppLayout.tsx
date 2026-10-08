import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { SubscriptionBanner } from '@/features/billing/SubscriptionBanner'
import { AddSheet } from './AddSheet'
import { BottomNav } from './BottomNav'

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const location = useLocation()
  return (
    <div className="min-h-dvh pt-safe">
      {/* key = sti → en kort fade/slide ved sideskift */}
      <main key={location.pathname} className="animate-page mx-auto max-w-lg px-safe pb-[calc(110px+env(safe-area-inset-bottom))]">
        <SubscriptionBanner />
        <Outlet />
      </main>
      <BottomNav onAdd={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
