import { ChevronRight, Landmark } from 'lucide-react'
import { Link } from 'react-router'
import { useBankInbox } from './api'

/** "3 nye posteringer fra banken" – vises kun, når der er noget at gennemgå */
export function BankInboxLink() {
  const inbox = useBankInbox()
  const n = (inbox.data ?? []).filter((r) => r.state === 'new').length
  if (!n) return null
  return (
    <Link to="/okonomi/bank" className="pressable mt-3 flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-surface-accent">
        <Landmark className="size-5 text-accent-text" />
      </span>
      <span className="flex-1">
        <span className="block text-[16px] font-semibold">{n === 1 ? '1 ny postering' : `${n} nye posteringer`} fra banken</span>
        <span className="block text-[13px] text-secondary">Godkend dem, der skal med i budgettet</span>
      </span>
      <ChevronRight className="size-5 text-muted" />
    </Link>
  )
}
