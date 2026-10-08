// Edge Function (verify_jwt slået fra): modtager Stripe-hændelser og tjekker selv signaturen.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyStripeSignature, type StripeSubscription } from '../_shared/stripe.ts'
import { handleWebhook } from './handler.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  const raw = await req.text()
  const res = await handleWebhook(raw, req.headers.get('stripe-signature'), {
    verify: (body, sig) => verifyStripeSignature(body, sig, SECRET),
    apply: async (u, at) => {
      const { error } = await admin.rpc('billing_apply', {
        p_household: u.household,
        p_customer: u.customer,
        p_subscription: u.subscription,
        p_status: u.status,
        p_plan: u.plan,
        p_period_end: u.periodEnd,
        p_cancel_at_period_end: u.cancelAtPeriodEnd,
        p_payer: u.payer,
        p_event_at: at,
      })
      if (error) throw error
    },
    fetchSubscription: async (id) => {
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Stripe-Version': '2025-03-31.basil' },
      })
      if (!r.ok) throw new Error(`stripe ${r.status}`)
      return (await r.json()) as StripeSubscription
    },
    log: (msg) => console.error(msg),
  })
  return new Response(res.body, { status: res.status })
})
