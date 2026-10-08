import { CreditCard } from 'lucide-react'
import { ListRow } from '@/components/ui/ListRow'
import { daysLeft } from '@/lib/billing'
import { useSubscription } from './api'

/** Række i Indstillinger → Husstand (kun når betaling er slået til) */
export function SubscriptionRow() {
  const sub = useSubscription()
  const s = sub.data
  if (!s?.billing_enabled || s.status === 'comped') return null
  const d = daysLeft(s.trial_ends_at)
  const subtitle = !s.write_access
    ? 'Udløbet'
    : s.status === 'active'
      ? s.cancel_at_period_end ? 'Opsagt' : 'Aktivt'
      : s.status === 'past_due'
        ? 'Betalingen mislykkedes'
        : `Prøveperiode · ${d} ${d === 1 ? 'dag' : 'dage'} tilbage`
  return <ListRow icon={CreditCard} title="Abonnement" subtitle={subtitle} to="/indstillinger/abonnement" />
}
