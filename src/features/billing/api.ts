import { useMutation, useQuery } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import type { Plan, SubscriptionInfo } from '@/lib/billing'
import { supabase } from '@/lib/supabase'

export const subscriptionKey = (hid: string) => ['subscription', hid] as const

export function useSubscription() {
  const { id } = useHousehold()
  return useQuery({
    queryKey: subscriptionKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subscription_info')
      if (error) throw error
      return data as unknown as SubscriptionInfo
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

type BillingResult = { ok: boolean; url?: string; error?: string }

async function billing(body: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke<BillingResult>('billing', { body })
  if (data?.ok && data.url) return data.url
  // Fejlsvar fra funktionen (4xx) ligger i error.context
  let code = data?.error
  if (!code && error) {
    const ctx = (error as { context?: Response }).context
    code = ctx ? ((await ctx.json().catch(() => ({}))) as BillingResult).error : undefined
  }
  throw new Error(code ?? 'server')
}

/** Videre til Stripes betalingsside (forlader appen et øjeblik) */
export function useStartCheckout() {
  return useMutation({
    mutationFn: async (plan: Plan) => {
      window.location.assign(await billing({ action: 'checkout', plan }))
    },
  })
}

/** Stripes side til at skifte kort, se kvitteringer og opsige */
export function useOpenPortal() {
  return useMutation({
    mutationFn: async () => {
      window.location.assign(await billing({ action: 'portal' }))
    },
  })
}

export function billingErrorMessage(e: unknown): string {
  switch ((e as Error | null)?.message) {
    case 'already_active':
      return 'Husstanden har allerede et aktivt abonnement.'
    case 'not_payer':
      return 'Kun den, der betaler, kan ændre betalingen.'
    case 'billing_disabled':
    case 'not_needed':
      return 'Jeres husstand skal ikke betale.'
    case 'not_allowed':
      return 'Kun voksne kan administrere abonnementet.'
    default:
      return 'Betalingssiden kunne ikke åbnes. Prøv igen om lidt.'
  }
}
