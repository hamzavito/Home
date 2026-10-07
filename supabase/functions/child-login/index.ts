// Edge Function: barnelogin (husstandskode + brugernavn + PIN).
// Kaldes uden login. Service role-nøglen findes kun her på serveren.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { childLogin, clientIp, type VerifyResult } from './login.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(URL_, SERVICE, noSession)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'invalid' }, { status: 405, headers: CORS })
  const body = await req.json().catch(() => null)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''

  const res = await childLogin(body, clientIp(req.headers), {
    verify: async (code, username, pin, ip) => {
      const { data, error } = await admin.rpc('child_login_verify', { p_code: code, p_username: username, p_pin: pin, p_ip: ip })
      if (error) throw error
      return data as VerifyResult
    },
    createSession: async (email) => {
      // Engangs-token til den skjulte identitet (sendes ikke som e-mail) → byttes straks til en session
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
      if (error || !data.properties?.hashed_token) throw error ?? new Error('no_token')
      const anon = createClient(URL_, anonKey, noSession)
      const { data: v, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token })
      if (e2 || !v.session) throw e2 ?? new Error('no_session')
      return { access_token: v.session.access_token, refresh_token: v.session.refresh_token, expires_in: v.session.expires_in, expires_at: v.session.expires_at }
    },
  })
  return Response.json(res.body, { status: res.status, headers: CORS })
})
