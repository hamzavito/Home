import { useState } from 'react'
import { Outlet } from 'react-router'
import { AddSheet } from './AddSheet'
import { BottomNav } from './BottomNav'

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="min-h-dvh pt-safe">
      <main className="mx-auto max-w-lg px-safe pb-[calc(96px+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav onAdd={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
