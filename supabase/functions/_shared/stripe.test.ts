import { describe, expect, it } from 'vitest'
import { formEncode, mapStatus, subscriptionUpdate, verifyStripeSignature } from './stripe'

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('Stripe', () => {
  it('formular-kodning med lister og objekter', () => {
    expect(formEncode({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { household_id: 'h' }, x: undefined })).toBe(
      'mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bhousehold_id%5D=h',
    )
  })

  it('godkender kun korrekte, friske signaturer', async () => {
    const body = '{"id":"evt_1"}'
    const t = 1_800_000_000
    const sig = await sign('whsec_test', `${t}.${body}`)
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_test', t + 10)).toBe(true)
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_andet', t + 10)).toBe(false)
    expect(await verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, 'whsec_test', t + 10)).toBe(false)
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_test', t + 3600)).toBe(false)
    expect(await verifyStripeSignature(body, null, 'whsec_test', t)).toBe(false)
    expect(await verifyStripeSignature(body, `t=${t},v0=${sig}`, 'whsec_test', t)).toBe(false)
  })

  it('oversætter status', () => {
    expect(mapStatus('active')).toBe('active')
    expect(mapStatus('unpaid')).toBe('past_due')
    expect(mapStatus('incomplete_expired')).toBe('canceled')
    expect(mapStatus('incomplete')).toBeNull()
  })

  it('uddrager abonnement (ny og gammel API-form)', () => {
    const base = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { household_id: '11111111-1111-4111-8111-111111111111', payer_user_id: '00000000-0000-4000-8000-0000000000a1' } }
    const nyt = subscriptionUpdate({ ...base, items: { data: [{ current_period_end: 1_800_000_000, price: { recurring: { interval: 'year' } } }] } })
    expect(nyt).toMatchObject({ status: 'active', plan: 'yearly', periodEnd: new Date(1_800_000_000_000).toISOString(), payer: base.metadata.payer_user_id })
    const gammelt = subscriptionUpdate({ ...base, current_period_end: 1_700_000_000, items: { data: [{ price: { recurring: { interval: 'month' } } }] } })
    expect(gammelt).toMatchObject({ plan: 'monthly', periodEnd: new Date(1_700_000_000_000).toISOString() })
    expect(subscriptionUpdate({ ...base, metadata: {} })).toBeNull()
    expect(subscriptionUpdate({ ...base, status: 'incomplete' })).toBeNull()
  })
})
