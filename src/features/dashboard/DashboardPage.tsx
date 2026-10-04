import { Camera, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { addActions, CURRENT_PHASE, sections } from '@/app/sections'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatMonth, formatWeekday, greeting } from '@/lib/dates'

const quick = [
  { action: addActions.find((a) => a.key === 'expense')!, icon: Wallet },
  { action: addActions.find((a) => a.key === 'receipt')!, icon: Camera },
]

export function DashboardPage() {
  const { me } = useHousehold()
  const now = new Date()

  return (
    <>
      <header className="pb-2 pt-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{formatWeekday(now)}</p>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight">
          {greeting(now)}, {me.displayName}
        </h1>
      </header>

      <Card className="mt-2">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{formatMonth(now)}</p>
        <p className="mt-3 text-[15px] text-text-secondary">Tilbage i budget</p>
        <Skeleton className="mt-1 h-10 w-44" />
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
        <p className="mt-3 text-[13px] text-text-tertiary">Budgetoverblikket kommer i fase {sections.budgets.phase}.</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {quick.map(({ action, icon: Icon }) => {
          const ready = action.phase <= CURRENT_PHASE
          const inner = (
            <>
              <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: action.color }}>
                <Icon className="size-5 text-white" />
              </span>
              <span className="text-[15px] font-semibold">{action.title}</span>
              {!ready && <span className="text-[12px] text-text-tertiary">Snart</span>}
            </>
          )
          const cls = 'flex flex-col items-start gap-2 rounded-card bg-surface-strong p-4 shadow-card'
          return ready ? (
            <Link key={action.key} to={action.path} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={action.key} className={cls} aria-disabled>
              {inner}
            </div>
          )
        })}
      </div>

      <SectionTitle>Kommende</SectionTitle>
      <Card>
        <p className="text-[15px] text-text-secondary">Kommende udgifter og aftaler vises her.</p>
      </Card>
    </>
  )
}
