import { AlertCircle, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { subscriptionBanner } from '@/lib/billing'
import { cn } from '@/lib/cn'
import { useSubscription } from './api'

/** Kort besked øverst, når prøveperioden snart slutter, betalingen fejler eller abonnementet er udløbet */
export function SubscriptionBanner() {
  const { me } = useHousehold()
  const sub = useSubscription()
  const location = useLocation()
  const banner = subscriptionBanner(sub.data)
  if (!banner || location.pathname === '/indstillinger/abonnement') return null
  const content = (
    <>
      <AlertCircle className="size-5 shrink-0" />
      <span className="flex-1">{banner.text}</span>
      {!me.isChild && <ChevronRight className="size-5 shrink-0" />}
    </>
  )
  const cls = cn('mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-semibold', banner.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-notice-soft text-notice')
  // Børn kan ikke betale – de ser kun beskeden
  if (me.isChild) return <div role="status" className={cls}>{content}</div>
  return (
    <Link to="/indstillinger/abonnement" role="status" className={cn(cls, 'pressable')}>
      {content}
    </Link>
  )
}
