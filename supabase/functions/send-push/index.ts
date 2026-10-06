// Edge Function: sender notifikationer (Web Push).
// Kaldes af private.push_tick() via pg_net – hvert minut af Supabase Cron, når der er
// noget at sende, og med det samme ved en testbesked. Headeren x-push-secret
// kontrolleres mod Supabase Vault via verify_push_secret (kun service role).
// Beskederne hentes med claim_push_messages, så hver besked kun sendes én gang.
// Første gang genereres VAPID-nøglerne her og gemmes i Vault (de forlader aldrig Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateVapidKeys, sendPush, type VapidKeys } from './webpush.ts'

type Claimed = { subscription_id: string; endpoint: string; p256dh: string; auth: string; payload: { ttl?: number } & Record<string, unknown> }
type StoredKeys = { public_key: string; private_jwk: string; subject: string }

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const given = req.headers.get('x-push-secret') ?? ''
  const { data: authorized } = given.length >= 32 ? await supabase.rpc('verify_push_secret', { p_secret: given }) : { data: false }
  if (authorized !== true) return new Response('Unauthorized', { status: 401 })

  try {
    let { data: stored } = await supabase.rpc('push_vapid_keys')
    if (!stored) {
      const fresh = await generateVapidKeys()
      const { data, error } = await supabase.rpc('init_push_vapid_keys', { p_public: fresh.publicKey, p_private_jwk: JSON.stringify(fresh.privateJwk) })
      if (error) throw new Error(`init_push_vapid_keys: ${error.message}`)
      stored = data
      console.log('VAPID-nøgler oprettet')
    }
    const s = stored as StoredKeys
    const keys: VapidKeys = { publicKey: s.public_key, privateJwk: JSON.parse(s.private_jwk) }

    const { data: claimed, error } = await supabase.rpc('claim_push_messages')
    if (error) throw new Error(`claim_push_messages: ${error.message}`)
    const messages = (claimed ?? []) as Claimed[]

    const results = await Promise.allSettled(
      messages.map((m) => {
        const { ttl, ...payload } = m.payload
        return sendPush(m, payload, { keys, subject: s.subject, ttl: ttl ?? 3600 })
      }),
    )
    const ok: string[] = []
    const gone: string[] = []
    let failed = 0
    results.forEach((r, i) => {
      const id = messages[i]!.subscription_id
      if (r.status === 'fulfilled' && r.value.ok) ok.push(id)
      else if (r.status === 'fulfilled' && r.value.gone) gone.push(id)
      else {
        failed++
        console.error('Push fejlede', new URL(messages[i]!.endpoint).host, r.status === 'fulfilled' ? r.value.status : String(r.reason))
      }
    })
    if (ok.length || gone.length) {
      const { error: recErr } = await supabase.rpc('record_push_results', { p_ok: ok, p_gone: gone })
      if (recErr) console.error('record_push_results', recErr.message)
    }
    const summary = { ok: true, sent: ok.length, gone: gone.length, failed }
    if (messages.length) console.log(JSON.stringify(summary))
    return Response.json(summary)
  } catch (e) {
    console.error(e)
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
