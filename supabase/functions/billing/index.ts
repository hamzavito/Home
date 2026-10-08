// Edge Function: start betaling eller åbn kundeportalen. Stripe-nøglen findes kun her.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { formEncode } from '../_shared/stripe.ts'
import { handleBilling, type BillingContext } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'bad_request' }, { status: 405, headers: CORS })
  const body = await req.json().catch(() => null)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

  const res = await handleBilling(body, {
    caller: async () => {
      if (!jwt) return null
      const { data, error } = await admin.auth.getUser(jwt)
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null }
    },
    context: async (userId) => {
      const { data, error } = await admin.rpc('billing_context', { p_user: userId })
      if (error) throw error
      return (data as BillingContext | null) ?? null
    },
    stripe: async (path, params) => {
      const r = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2025-03-31.basil' },
        body: formEncode(params),
      })
      const json = (await r.json()) as Record<string, unknown>
      if (!r.ok) throw new Error(String((json.error as { message?: string } | undefined)?.message ?? r.status))
      return json
    },
    setCustomer: async (household, customer) => {
      const { error } = await admin.rpc('billing_set_customer', { p_household: household, p_customer: customer })
      if (error) throw error
    },
    prices: { monthly: Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '', yearly: Deno.env.get('STRIPE_PRICE_YEARLY') ?? '' },
    appUrl: Deno.env.get('APP_URL') ?? '',
    log: (msg) => console.error(msg),
  })
  return Response.json(res.body, { status: res.status, headers: CORS })
})
