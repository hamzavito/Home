// Stripe uden SDK: formular-kodning, signaturkontrol af webhooks og status-oversættelse.
// Rene funktioner (ingen Deno-API'er), så de kan unit-testes med vitest.

/** Stripe forventer application/x-www-form-urlencoded med "a[b][0]=c"-nøgler */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') parts.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`))
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
      })
    } else if (typeof v === 'object') parts.push(formEncode(v as Record<string, unknown>, key))
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return parts.filter(Boolean).join('&')
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Kontrollér "Stripe-Signature: t=…,v1=…" (højst 5 min. gammel) */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<boolean> {
  if (!header || !secret) return false
  const items = header.split(',').map((p) => p.trim().split('='))
  const t = Number(items.find(([k]) => k === 't')?.[1])
  const sigs = items.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
  if (!Number.isFinite(t) || sigs.length === 0) return false
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false
  const expected = await hmacSha256(secret, `${t}.${rawBody}`)
  return sigs.some((s) => timingSafeEqual(s, expected))
}

export type OurStatus = 'active' | 'past_due' | 'canceled'

/** Stripe-status → vores. null = ingen ændring (fx "incomplete" under første betaling) */
export function mapStatus(stripe: string): OurStatus | null {
  switch (stripe) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return 'canceled'
    default:
      return null
  }
}

export type StripeSubscription = {
  id: string
  customer: string | { id: string }
  status: string
  cancel_at_period_end?: boolean
  current_period_end?: number
  metadata?: Record<string, string>
  items?: { data?: Array<{ current_period_end?: number; price?: { id?: string; recurring?: { interval?: string } | null } }> }
}

export type SubscriptionUpdate = {
  household: string
  customer: string
  subscription: string
  status: OurStatus
  plan: 'monthly' | 'yearly' | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  payer: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Uddrag det, vi gemmer. null = ikke vores (mangler husstand) eller ingen statusændring. */
export function subscriptionUpdate(sub: StripeSubscription): SubscriptionUpdate | null {
  const household = sub.metadata?.household_id ?? ''
  const status = mapStatus(sub.status)
  if (!UUID_RE.test(household) || !status) return null
  const item = sub.items?.data?.[0]
  const interval = item?.price?.recurring?.interval
  // Nyere Stripe-API'er har perioden på abonnementets linjer i stedet for på abonnementet
  const end = item?.current_period_end ?? sub.current_period_end
  const payer = sub.metadata?.payer_user_id ?? ''
  return {
    household,
    customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    subscription: sub.id,
    status,
    plan: interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null,
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    payer: UUID_RE.test(payer) ? payer : null,
  }
}
