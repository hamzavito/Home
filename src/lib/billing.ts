// Abonnement: priser, status og tekster. Priserne skal svare til dem, der er
// oprettet i Stripe (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY), inkl. moms.

export const PRICES_ORE = { monthly: 4900, yearly: 44900 } as const
export type Plan = keyof typeof PRICES_ORE

/** Hvor meget man sparer med årlig betaling i forhold til 12 måneder */
export const yearlySavingOre = () => PRICES_ORE.monthly * 12 - PRICES_ORE.yearly

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'comped'

export type SubscriptionInfo = {
  billing_enabled: boolean
  status: SubscriptionStatus
  plan: Plan | null
  trial_ends_at: string | null
  current_period_end: string | null
  grace_ends_at: string | null
  cancel_at_period_end: boolean
  payer_user_id: string | null
  has_customer: boolean
  write_access: boolean
}

export const READ_ONLY_MESSAGE = 'Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.'

/** Fejl fra databasen, når husstanden er skrivebeskyttet (SQLSTATE PT402 → HTTP 402) */
export function isReadOnlyError(e: unknown): boolean {
  const err = e as { code?: string; message?: string; status?: number } | null
  return err?.code === 'PT402' || err?.status === 402 || Boolean(err?.message?.startsWith('Abonnementet er udløbet'))
}

/** Hele dage tilbage (rundet op), aldrig negativ */
export function daysLeft(iso: string | null, now = new Date()): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000))
}

export type Banner = { tone: 'notice' | 'danger'; text: string } | null

/** Kort besked øverst i appen – kun når der er noget, man skal gøre */
export function subscriptionBanner(info: SubscriptionInfo | undefined, now = new Date()): Banner {
  if (!info?.billing_enabled || info.status === 'comped') return null
  if (!info.write_access) return { tone: 'danger', text: 'Abonnementet er udløbet. I kan se jeres data, men ikke ændre noget.' }
  if (info.status === 'past_due') return { tone: 'danger', text: 'Betalingen mislykkedes. Opdatér betalingen for at beholde adgangen.' }
  if (info.status === 'trialing' || (info.status === 'canceled' && info.trial_ends_at)) {
    const d = daysLeft(info.trial_ends_at, now)
    if (d <= 7) return { tone: 'notice', text: d <= 1 ? 'Prøveperioden slutter i dag.' : `Prøveperioden slutter om ${d} dage.` }
  }
  return null
}
