import { describe, expect, it, vi } from 'vitest'
import { handleBilling, type BillingContext, type BillingDeps } from './handler'
import { handleWebhook } from '../stripe-webhook/handler'

const ctx = (over: Partial<BillingContext> = {}): BillingContext => ({
  household_id: '11111111-1111-4111-8111-111111111111', household_name: 'Familien', role: 'owner', status: 'trialing',
  payer_user_id: null, stripe_customer_id: null, billing_enabled: true, ...over,
})

function deps(c: BillingContext | null, over: Partial<BillingDeps> = {}) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const d: BillingDeps = {
    caller: async () => ({ id: 'u1', email: 'a@b.dk' }),
    context: async () => c,
    stripe: async (path, params) => {
      calls.push([path, params])
      return path === 'customers' ? { id: 'cus_new' } : { url: `https://stripe.test/${path}` }
    },
    setCustomer: vi.fn(async () => {}),
    prices: { monthly: 'price_m', yearly: 'price_y' },
    appUrl: 'https://hjem.test',
    ...over,
  }
  return { d, calls }
}

describe('billing', () => {
  it('starter betaling: opretter kunde og checkout med husstand og betaler', async () => {
    const { d, calls } = deps(ctx())
    const r = await handleBilling({ action: 'checkout', plan: 'yearly' }, d)
    expect(r).toEqual({ status: 200, body: { ok: true, url: 'https://stripe.test/checkout/sessions' } })
    expect(d.setCustomer).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'cus_new')
    const session = calls.find(([p]) => p === 'checkout/sessions')![1]
    expect(session).toMatchObject({
      mode: 'subscription', customer: 'cus_new', line_items: [{ price: 'price_y', quantity: 1 }],
      success_url: 'https://hjem.test/indstillinger/abonnement?betaling=ok',
      subscription_data: { metadata: { household_id: '11111111-1111-4111-8111-111111111111', payer_user_id: 'u1' } },
    })
  })

  it('genbruger egen kunde, men ny voksen får egen kunde', async () => {
    const same = deps(ctx({ status: 'canceled', stripe_customer_id: 'cus_old', payer_user_id: 'u1' }))
    await handleBilling({ action: 'checkout', plan: 'monthly' }, same.d)
    expect(same.calls.map(([p]) => p)).toEqual(['checkout/sessions'])
    const other = deps(ctx({ status: 'canceled', stripe_customer_id: 'cus_old', payer_user_id: 'u2' }))
    await handleBilling({ action: 'checkout', plan: 'monthly' }, other.d)
    expect(other.calls.map(([p]) => p)).toEqual(['customers', 'checkout/sessions'])
  })

  it('afviser når det ikke giver mening', async () => {
    expect((await handleBilling({ action: 'checkout', plan: 'monthly' }, deps(ctx({ status: 'active' })).d)).body).toEqual({ ok: false, error: 'already_active' })
    expect((await handleBilling({ action: 'checkout', plan: 'monthly' }, deps(ctx({ status: 'comped' })).d)).body).toEqual({ ok: false, error: 'not_needed' })
    expect((await handleBilling({ action: 'checkout', plan: 'monthly' }, deps(ctx({ billing_enabled: false })).d)).body).toEqual({ ok: false, error: 'billing_disabled' })
    expect((await handleBilling({ action: 'checkout', plan: 'monthly' }, deps(ctx({ role: 'child' })).d)).status).toBe(403)
    expect((await handleBilling({ action: 'checkout', plan: 'gratis' }, deps(ctx()).d)).status).toBe(400)
    expect((await handleBilling({ action: 'checkout', plan: 'monthly' }, deps(null).d)).status).toBe(403)
    expect((await handleBilling({}, deps(ctx(), { caller: async () => null }).d)).status).toBe(401)
  })

  it('kundeportal kun for betaleren', async () => {
    expect((await handleBilling({ action: 'portal' }, deps(ctx({ stripe_customer_id: 'cus_1', payer_user_id: 'u1' })).d)).status).toBe(200)
    expect((await handleBilling({ action: 'portal' }, deps(ctx({ stripe_customer_id: 'cus_1', payer_user_id: 'u2' })).d)).body).toEqual({ ok: false, error: 'not_payer' })
    expect((await handleBilling({ action: 'portal' }, deps(ctx()).d)).body).toEqual({ ok: false, error: 'no_customer' })
  })
})

describe('stripe-webhook', () => {
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { household_id: '11111111-1111-4111-8111-111111111111' }, items: { data: [{ current_period_end: 1_800_000_000, price: { recurring: { interval: 'month' } } }] } }
  it('afviser forkert signatur', async () => {
    const apply = vi.fn()
    const r = await handleWebhook('{}', 'x', { verify: async () => false, apply, fetchSubscription: vi.fn() })
    expect(r.status).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })
  it('opdaterer ved abonnementshændelser og efter checkout', async () => {
    const apply = vi.fn(async () => {})
    await handleWebhook(JSON.stringify({ type: 'customer.subscription.updated', created: 1_700_000_000, data: { object: sub } }), 's', { verify: async () => true, apply, fetchSubscription: vi.fn() })
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', plan: 'monthly', subscription: 'sub_1' }), new Date(1_700_000_000_000).toISOString())
    const fetchSubscription = vi.fn(async () => sub)
    await handleWebhook(JSON.stringify({ type: 'checkout.session.completed', created: 1, data: { object: { subscription: 'sub_1' } } }), 's', { verify: async () => true, apply, fetchSubscription })
    expect(fetchSubscription).toHaveBeenCalledWith('sub_1')
    expect(apply).toHaveBeenCalledTimes(2)
  })
  it('fejl → 500, så Stripe prøver igen', async () => {
    const r = await handleWebhook(JSON.stringify({ type: 'customer.subscription.deleted', data: { object: sub } }), 's', { verify: async () => true, apply: async () => Promise.reject(new Error('db')), fetchSubscription: vi.fn() })
    expect(r.status).toBe(500)
  })
})
