import { describe, expect, it } from 'vitest'
import { daysLeft, isReadOnlyError, subscriptionBanner, yearlySavingOre, type SubscriptionInfo } from './billing'

const now = new Date('2026-10-08T12:00:00Z')
const info = (over: Partial<SubscriptionInfo>): SubscriptionInfo => ({
  billing_enabled: true, status: 'trialing', plan: null, trial_ends_at: '2026-11-07T12:00:00Z', current_period_end: null,
  grace_ends_at: null, cancel_at_period_end: false, payer_user_id: null, has_customer: false, write_access: true, ...over,
})

describe('abonnement', () => {
  it('årlig betaling sparer 139 kr.', () => expect(yearlySavingOre()).toBe(13900))
  it('dage tilbage rundes op og går ikke under nul', () => {
    expect(daysLeft('2026-10-09T11:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0)
  })
  it('genkender skrivebeskyttelse', () => {
    expect(isReadOnlyError({ code: 'PT402', message: 'x' })).toBe(true)
    expect(isReadOnlyError({ message: 'Abonnementet er udløbet. I kan …' })).toBe(true)
    expect(isReadOnlyError({ code: '23514', message: 'andet' })).toBe(false)
  })
  it('banner kun når der er noget at gøre', () => {
    expect(subscriptionBanner(info({}), now)).toBeNull()
    expect(subscriptionBanner(info({ trial_ends_at: '2026-10-11T12:00:00Z' }), now)?.text).toBe('Prøveperioden slutter om 3 dage.')
    expect(subscriptionBanner(info({ write_access: false }), now)?.tone).toBe('danger')
    expect(subscriptionBanner(info({ status: 'past_due' }), now)?.text).toMatch(/Betalingen mislykkedes/)
    expect(subscriptionBanner(info({ status: 'active' }), now)).toBeNull()
    expect(subscriptionBanner(info({ billing_enabled: false, write_access: false }), now)).toBeNull()
    expect(subscriptionBanner(info({ status: 'comped' }), now)).toBeNull()
  })
})
