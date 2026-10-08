// Abonnement: start betaling (Stripe Checkout) eller åbn Stripes kundeportal.
// Kortoplysninger håndteres udelukkende af Stripe. Kun voksne i husstanden.

export type BillingContext = {
  household_id: string
  household_name: string
  role: 'owner' | 'adult' | 'child'
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'comped'
  payer_user_id: string | null
  stripe_customer_id: string | null
  billing_enabled: boolean
}

export type BillingDeps = {
  caller: () => Promise<{ id: string; email: string | null } | null>
  context: (userId: string) => Promise<BillingContext | null>
  stripe: (path: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
  setCustomer: (household: string, customer: string) => Promise<void>
  prices: { monthly: string; yearly: string }
  appUrl: string
  log?: (msg: string) => void
}

type Err = 'unauthorized' | 'not_allowed' | 'billing_disabled' | 'not_needed' | 'already_active' | 'no_customer' | 'not_payer' | 'bad_request' | 'server'
export type BillingResponse = { status: number; body: { ok: true; url: string } | { ok: false; error: Err } }

const fail = (status: number, error: Err): BillingResponse => ({ status, body: { ok: false, error } })

export async function handleBilling(body: unknown, deps: BillingDeps): Promise<BillingResponse> {
  const user = await deps.caller().catch(() => null)
  if (!user) return fail(401, 'unauthorized')
  const b = (body ?? {}) as { action?: unknown; plan?: unknown }
  let ctx: BillingContext | null
  try {
    ctx = await deps.context(user.id)
  } catch {
    return fail(500, 'server')
  }
  if (!ctx || ctx.role === 'child') return fail(403, 'not_allowed')
  if (!ctx.billing_enabled) return fail(409, 'billing_disabled')

  const back = `${deps.appUrl.replace(/\/$/, '')}/indstillinger/abonnement`
  try {
    if (b.action === 'checkout') {
      if (b.plan !== 'monthly' && b.plan !== 'yearly') return fail(400, 'bad_request')
      if (ctx.status === 'comped') return fail(409, 'not_needed')
      if (ctx.status === 'active' || ctx.status === 'past_due') return fail(409, 'already_active')
      // Kunden hos Stripe hører til betaleren. Overtager en anden voksen, får de sin egen.
      let customer = ctx.payer_user_id && ctx.payer_user_id !== user.id ? null : ctx.stripe_customer_id
      if (!customer) {
        const c = await deps.stripe('customers', {
          email: user.email ?? undefined,
          description: ctx.household_name,
          metadata: { household_id: ctx.household_id, user_id: user.id },
        })
        customer = String(c.id)
        await deps.setCustomer(ctx.household_id, customer)
      }
      const session = await deps.stripe('checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: ctx.household_id,
        line_items: [{ price: b.plan === 'yearly' ? deps.prices.yearly : deps.prices.monthly, quantity: 1 }],
        success_url: `${back}?betaling=ok`,
        cancel_url: back,
        locale: 'da',
        allow_promotion_codes: true,
        metadata: { household_id: ctx.household_id },
        subscription_data: { metadata: { household_id: ctx.household_id, payer_user_id: user.id } },
      })
      return { status: 200, body: { ok: true, url: String(session.url) } }
    }

    if (b.action === 'portal') {
      if (!ctx.stripe_customer_id) return fail(409, 'no_customer')
      if (ctx.payer_user_id && ctx.payer_user_id !== user.id) return fail(403, 'not_payer')
      const portal = await deps.stripe('billing_portal/sessions', { customer: ctx.stripe_customer_id, return_url: back, locale: 'da' })
      return { status: 200, body: { ok: true, url: String(portal.url) } }
    }
  } catch (e) {
    deps.log?.(`stripe: ${(e as Error)?.message}`)
    return fail(502, 'server')
  }
  return fail(400, 'bad_request')
}
