// Edge Function: ejerens administration af børn (opret med/uden login, giv login, slå fra/til, slet).
// Kræver login; databasen afgør om kalderen er ejer. Service role-nøglen findes kun her.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleAdmin } from './admin.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'bad_request' }, { status: 405, headers: CORS })
  const body = await req.json().catch(() => null)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''

  const res = await handleAdmin(body, {
    callerId: async () => {
      if (!jwt) return null
      const { data, error } = await admin.auth.getUser(jwt)
      return error ? null : (data.user?.id ?? null)
    },
    check: async (owner, username) => {
      const { data, error } = await admin.rpc('child_account_check', { p_owner: owner, p_username: username })
      if (error) throw error
      return data as string
    },
    createAuthUser: async (email, password, name) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name },
        app_metadata: { account: 'child' },
      })
      if (error || !data.user) throw error ?? new Error('no_user')
      return data.user.id
    },
    deleteAuthUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
    },
    createAccount: async (owner, child, name, username, pin, pinLength) => {
      const { error } = await admin.rpc('child_account_create', {
        p_owner: owner, p_child: child, p_name: name, p_username: username, p_pin: pin, p_pin_length: pinLength,
      })
      if (error) throw error
    },
    createProfile: async (owner, child, name, wallet) => {
      const { error } = await admin.rpc('child_profile_create', { p_owner: owner, p_child: child, p_name: name, p_wallet: wallet })
      if (error) throw error
    },
    addLogin: async (owner, child, username, pin, pinLength) => {
      const { error } = await admin.rpc('child_add_login', { p_owner: owner, p_child: child, p_username: username, p_pin: pin, p_pin_length: pinLength })
      if (error) throw error
    },
    deleteChild: async (owner, child) => {
      const { error } = await admin.rpc('child_delete_prepare', { p_owner: owner, p_child: child })
      if (error) throw error
    },
    deleteUser: async (id, soft) => {
      const { error } = await admin.auth.admin.deleteUser(id, soft)
      if (error) throw error
    },
    setDisabled: async (owner, child, disabled) => {
      const { error } = await admin.rpc('child_account_set_disabled', { p_owner: owner, p_child: child, p_disabled: disabled })
      if (error) throw error
    },
    setBanned: async (child, banned) => {
      const { error } = await admin.auth.admin.updateUserById(child, { ban_duration: banned ? '876000h' : 'none' })
      if (error) throw error
    },
    randomId: () => crypto.randomUUID(),
    randomPassword,
    log: (msg) => console.error(msg),
  })
  return Response.json(res.body, { status: res.status, headers: CORS })
})
