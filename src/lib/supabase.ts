import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env, isConfigured } from './env'
import { authStorage } from './session-storage'

// Klienten oprettes kun når konfigurationen findes; ellers viser appen en
// tydelig fejlside i stedet for at gå ned.
export const supabase = isConfigured
  ? createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'hjem.auth',
        storage: authStorage,
      },
    })
  : (null as unknown as ReturnType<typeof createClient<Database>>)
