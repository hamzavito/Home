// Stripe → husstandens abonnement. Kun signerede hændelser fra Stripe accepteres.
import { subscriptionUpdate, type StripeSubscription, type SubscriptionUpdate } from '../_shared/stripe.ts'

export type WebhookDeps = {
  verify: (raw: string, signature: string | null) => Promise<boolean>
  apply: (u: SubscriptionUpdate, eventAt: string) => Promise<void>
  fetchSubscription: (id: string) => Promise<StripeSubscription>
  log?: (msg: string) => void
}

export async function handleWebhook(raw: string, signature: string | null, deps: WebhookDeps): Promise<{ status: number; body: string }> {
  if (!(await deps.verify(raw, signature))) return { status: 400, body: 'bad signature' }
  let event: { type?: string; created?: number; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(raw)
  } catch {
    return { status: 400, body: 'bad json' }
  }
  const at = new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()
  const obj = event.data?.object ?? {}
  try {
    let sub: StripeSubscription | null = null
    if (event.type?.startsWith('customer.subscription.')) sub = obj as unknown as StripeSubscription
    else if (event.type === 'checkout.session.completed' && typeof obj.subscription === 'string') sub = await deps.fetchSubscription(obj.subscription)
    if (sub) {
      const u = subscriptionUpdate(sub)
      if (u) await deps.apply(u, at)
    }
  } catch (e) {
    // 500 → Stripe prøver igen senere
    deps.log?.(`webhook: ${(e as Error)?.message}`)
    return { status: 500, body: 'retry' }
  }
  return { status: 200, body: 'ok' }
}
