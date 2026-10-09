// Edge Function: bankforbindelse via Enable Banking. Nøglerne findes kun her (Supabase secrets).
// verify_jwt er slået fra, fordi det daglige job kalder med en hemmelighed i stedet for login;
// alle andre handlinger kræver et gyldigt login (tjekkes nedenfor).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { EB_API, ebJwt } from '../_shared/enablebanking.ts'
import { handleBank } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const APP_ID = Deno.env.get('ENABLE_BANKING_APP_ID') ?? ''
const PRIVATE_KEY = (Deno.env.get('ENABLE_BANKING_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'bad_request' }, { status: 405, headers: CORS })
  const body = await req.json().catch(() => null)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const secret = req.headers.get('x-bank-secret') ?? ''
  // Når brugeren selv henter, fortæller vi banken det (PSD2: så gælder grænsen på 4 hentninger i døgnet ikke)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)
  const psu: Record<string, string> = jwt && ip ? { 'Psu-Ip-Address': ip, ...(ua ? { 'Psu-User-Agent': ua } : {}) } : {}

  const res = await handleBank(body, {
    configured: Boolean(APP_ID && PRIVATE_KEY),
    caller: async () => {
      if (!jwt) return null
      const { data, error } = await admin.auth.getUser(jwt)
      return error ? null : (data.user?.id ?? null)
    },
    isCron: async () => {
      if (secret.length < 32) return false
      const { data, error } = await admin.rpc('verify_bank_sync_secret', { p_secret: secret })
      return !error && data === true
    },
    eb: async (method, path, payload) => {
      const r = await fetch(`${EB_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await ebJwt(APP_ID, PRIVATE_KEY)}`, 'Content-Type': 'application/json', ...(path.startsWith('/accounts/') ? psu : {}) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      const text = await r.text()
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
      if (!r.ok) throw new Error(`Enable Banking ${r.status}: ${String(json.message ?? json.error ?? '').slice(0, 200)}`)
      return json
    },
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args)
      if (error) throw error
      return data
    },
    randomState: () => [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join(''),
    appUrl: Deno.env.get('APP_URL') ?? '',
    log: (msg) => console.error(msg),
  })
  return Response.json(res.body, { status: res.status, headers: CORS })
})
