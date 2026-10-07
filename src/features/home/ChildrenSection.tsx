import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useAwaitingRewards, useHouseholdWallets } from '@/features/child/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatAmount } from '@/lib/money'
import { walletBalance } from '@/lib/wallet'
import { useTasks } from './api'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Børnene som en naturlig del af Hjemmet: opgaver, godkendelser og saldo pr. barn */
export function ChildrenSection() {
  const { children, members } = useHousehold()
  const tasks = useTasks()
  const wallets = useHouseholdWallets(true)
  const awaiting = useAwaitingRewards()

  return (
    <>
      <SectionHeader title="Børn" />
      <div className="divide-y divide-subtle overflow-hidden rounded-card bg-surface-primary shadow-card">
        {children.map((c) => {
          const open = (tasks.data?.active ?? []).filter((t) => t.assignee_id === c.userId).length
          const pending = (awaiting.data ?? []).filter((t) => t.assignee_id === c.userId).length
          const txs = (wallets.data?.transactions ?? []).filter((t) => t.child_id === c.userId)
          const goals = (wallets.data?.goals ?? []).filter((g) => g.child_id === c.userId).length
          const parts = [
            tasks.isPending ? null : plural(open, 'opgave', 'opgaver'),
            pending > 0 ? `${pending} afventer godkendelse` : null,
            wallets.isPending ? null : `${formatAmount(walletBalance(txs))} kr.`,
            goals > 0 ? plural(goals, 'opsparingsmål', 'opsparingsmål') : null,
          ].filter(Boolean)
          return (
            <Link key={c.userId} to={`/hjemmet/barn/${c.userId}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 active:bg-surface-secondary">
              <Avatar name={c.displayName} color={c.color} index={members.indexOf(c)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{c.displayName}</span>
                <span className="block truncate text-[13px] text-secondary">
                  {parts.join(' · ') || ' '}
                </span>
              </span>
              {pending > 0 && (
                <span className="tabular shrink-0 rounded-full bg-notice-soft px-2.5 py-1 text-[12px] font-bold text-notice" aria-hidden>
                  {pending}
                </span>
              )}
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </Link>
          )
        })}
      </div>
    </>
  )
}
