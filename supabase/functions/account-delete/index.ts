// Edge Function: slet den indloggede brugers konto. Service role-nøglen findes kun her.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleDelete } from './deletion.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'bad_request' }, { status: 405, headers: CORS })
  const body = await req.json().catch(() => null)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

  const res = await handleDelete(body, {
    callerId: async () => {
      if (!jwt) return null
      const { data, error } = await admin.auth.getUser(jwt)
      return error ? null : (data.user?.id ?? null)
    },
    prepare: async (userId) => {
      const { data, error } = await admin.rpc('account_delete_prepare', { p_user: userId })
      if (error) throw error
      return data as { household_deleted: string | null; child_ids: string[] }
    },
    listFiles: async (prefix) => {
      const { data, error } = await admin.storage.from('receipts').list(prefix, { limit: 100 })
      if (error) throw error
      return (data ?? []).filter((f) => f.name && f.id).map((f) => `${prefix}/${f.name}`)
    },
    removeFiles: async (paths) => {
      const { error } = await admin.storage.from('receipts').remove(paths)
      if (error) throw error
    },
    deleteUser: async (id, soft) => {
      const { error } = await admin.auth.admin.deleteUser(id, soft)
      if (error) throw error
    },
    log: (msg) => console.error(msg),
  })
  return Response.json(res.body, { status: res.status, headers: CORS })
})
