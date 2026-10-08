import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { daysLeft, PRICES_ORE, yearlySavingOre, type Plan, type SubscriptionInfo } from '@/lib/billing'
import { cn } from '@/lib/cn'
import { formatLongDate } from '@/lib/dates'
import { formatKr } from '@/lib/money'
import { billingErrorMessage, useOpenPortal, useStartCheckout, useSubscription } from './api'

const fmt = (iso: string | null) => (iso ? formatLongDate(new Date(iso)) : '')

function statusText(s: SubscriptionInfo): { title: string; text: string } {
  const plan = s.plan === 'yearly' ? `Årlig · ${formatKr(PRICES_ORE.yearly)}` : s.plan === 'monthly' ? `Månedlig · ${formatKr(PRICES_ORE.monthly)}` : ''
  switch (s.status) {
    case 'comped':
      return { title: 'Gratis', text: 'Jeres husstand betaler ikke.' }
    case 'active':
      return s.cancel_at_period_end
        ? { title: 'Opsagt', text: `${plan} · gælder til ${fmt(s.current_period_end)}` }
        : { title: 'Aktivt', text: `${plan} · fornyes ${fmt(s.current_period_end)}` }
    case 'past_due':
      return { title: 'Betalingen mislykkedes', text: `Opdatér betalingen senest ${fmt(s.grace_ends_at)}, så I beholder adgangen.` }
    default: {
      const d = daysLeft(s.trial_ends_at)
      if (s.write_access && d > 0) return { title: 'Gratis prøveperiode', text: `${d} ${d === 1 ? 'dag' : 'dage'} tilbage · slutter ${fmt(s.trial_ends_at)}.` }
      return { title: 'Udløbet', text: 'I kan se og eksportere jeres data. Vælg en plan for at fortsætte.' }
    }
  }
}

export function SubscriptionPage() {
  const [params] = useSearchParams()
  const justPaid = params.get('betaling') === 'ok'
  const sub = useSubscription()
  if (sub.isPending) return <FullScreenLoader />
  if (!sub.data)
    return (
      <>
        <PageHeader title="Abonnement" back="/indstillinger" />
        <p className="text-[15px] text-secondary">Abonnementet kunne ikke hentes. Prøv igen.</p>
      </>
    )
  return <Subscription info={sub.data} justPaid={justPaid} refetch={() => void sub.refetch()} />
}

function Subscription({ info, justPaid, refetch }: { info: SubscriptionInfo; justPaid: boolean; refetch: () => void }) {
  const { members, me } = useHousehold()
  const checkout = useStartCheckout()
  const portal = useOpenPortal()
  const [plan, setPlan] = useState<Plan>('yearly')
  const st = statusText(info)
  const payer = info.payer_user_id ? (members.find((m) => m.userId === info.payer_user_id)?.displayName ?? 'Tidligere medlem') : null
  const iAmPayer = info.payer_user_id === me.userId
  const canChoose = info.billing_enabled && (info.status === 'trialing' || info.status === 'canceled')
  const canManage = info.has_customer && (iAmPayer || !info.payer_user_id) && info.status !== 'comped'
  const waiting = justPaid && info.status !== 'active'

  return (
    <>
      <PageHeader title="Abonnement" back="/indstillinger" />

      {justPaid && (
        <Card variant="tonal" className="mb-3 flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" />
          <div>
            <p className="text-[15px] font-semibold">Tak! Betalingen er gennemført.</p>
            <p className="text-[14px] text-secondary">
              {waiting ? 'Det kan tage et øjeblik, før status er opdateret.' : 'Abonnementet er aktivt. Er du i et betalingsvindue, kan du lukke det nu.'}
            </p>
            {waiting && (
              <Button size="sm" variant="secondary" className="mt-2" onClick={refetch}>
                Opdatér
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card variant="hero" className="text-white">
        <p className="text-[13px] font-semibold uppercase tracking-wide opacity-70">Status</p>
        <p className="mt-1 text-[26px] font-bold tracking-tight">{st.title}</p>
        <p className="mt-1 text-[15px] opacity-80">{st.text}</p>
        {payer && info.status !== 'comped' && <p className="mt-3 text-[14px] opacity-70">Betales af {iAmPayer ? 'dig' : payer}. Alle i husstanden er med.</p>}
      </Card>

      {canChoose && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-[17px] font-bold">Vælg plan</h2>
          <div role="radiogroup" aria-label="Plan" className="grid gap-3">
            {(['yearly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={plan === p}
                onClick={() => setPlan(p)}
                className={cn('pressable flex items-center gap-4 rounded-card bg-surface-primary p-5 text-left shadow-card ring-2 transition-shadow', plan === p ? 'ring-accent' : 'ring-transparent')}
              >
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">{p === 'yearly' ? 'Årlig' : 'Månedlig'}</span>
                  <span className="block text-[14px] text-secondary">{p === 'yearly' ? `Spar ${formatKr(yearlySavingOre())} om året` : 'Opsig når som helst'}</span>
                </span>
                <span className="text-right">
                  <Money ore={PRICES_ORE[p]} size="lg" />
                  <span className="block text-[13px] text-secondary">{p === 'yearly' ? 'pr. år' : 'pr. måned'}</span>
                </span>
              </button>
            ))}
          </div>
          {checkout.isError && <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{billingErrorMessage(checkout.error)}</p>}
          <Button block className="mt-4" loading={checkout.isPending} onClick={() => checkout.mutate(plan)}>
            <CreditCard className="size-5" /> Fortsæt til betaling
          </Button>
          <p className="mt-3 flex items-start gap-2 px-1 text-[13px] text-secondary">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            Betalingen sker sikkert hos Stripe med kort eller Apple Pay. Priserne er inkl. moms. Én betaling dækker hele husstanden, og du kan opsige når som helst.
          </p>
        </>
      )}

      {canManage && (
        <>
          {portal.isError && <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{billingErrorMessage(portal.error)}</p>}
          <Button block variant={canChoose ? 'secondary' : 'primary'} className="mt-4" loading={portal.isPending} onClick={() => portal.mutate()}>
            Administrér betaling
          </Button>
          <p className="mt-2 px-1 text-center text-[13px] text-secondary">Skift kort, se kvitteringer eller opsig.</p>
        </>
      )}

      {!canManage && info.payer_user_id && !iAmPayer && info.status !== 'canceled' && (
        <p className="mt-4 px-1 text-[14px] text-secondary">Kun {payer} kan ændre betalingen. Opsiger {payer}, kan du selv starte et abonnement bagefter.</p>
      )}
      {!info.billing_enabled && <p className="mt-4 px-1 text-[14px] text-secondary">Betaling er ikke slået til.</p>}
    </>
  )
}
