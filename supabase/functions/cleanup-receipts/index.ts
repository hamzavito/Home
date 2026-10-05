// Edge Function: daglig oprydning af kvitteringsbilleder.
// Kaldes af Supabase Cron (pg_cron + pg_net) med headeren x-cleanup-secret.
// Hemmeligheden ligger i Supabase Vault og kontrolleres via verify_cleanup_secret
// (kun service role). Er CLEANUP_SECRET sat som Edge Function-secret, bruges den i stedet.
// Bruger service role-nøglen, som KUN findes i Supabase (aldrig i frontend).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runCleanup, safeEqual, type ClaimedRow } from './cleanup.ts'

Deno.serve(async (req) => {
  const given = req.headers.get('x-cleanup-secret') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const envSecret = Deno.env.get('CLEANUP_SECRET') ?? ''
  let authorized = false
  if (given.length >= 32) {
    if (envSecret) {
      authorized = safeEqual(envSecret, given)
    } else {
      const { data, error } = await supabase.rpc('verify_cleanup_secret', { p_secret: given })
      authorized = !error && data === true
    }
  }
  if (!authorized) {
    return new Response('Unauthorized', { status: 401 })
  }

  const rpc = async <T>(fn: string, limit: number): Promise<T[]> => {
    const { data, error } = await supabase.rpc(fn, { p_limit: limit })
    if (error) throw new Error(`${fn}: ${error.message}`)
    return (data ?? []) as T[]
  }

  try {
    const summary = await runCleanup({
      claimExpired: (n) => rpc<ClaimedRow>('claim_expired_receipt_images', n),
      claimAbandoned: (n) => rpc<ClaimedRow>('claim_abandoned_receipts', n),
      listOrphans: (n) => rpc<{ storage_path: string }>('list_orphan_receipt_files', n),
      removeFiles: async (paths) => {
        // Storage API: sletning af ikke-eksisterende filer er ikke en fejl.
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await supabase.storage.from('receipts').remove(paths.slice(i, i + 100))
          if (error) throw error
        }
      },
      log: (m) => console.log(m),
    })
    return Response.json({ ok: true, ...summary })
  } catch (e) {
    console.error(e)
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
